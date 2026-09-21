using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace Farol.NetworkGuardian;

internal static class GuardianServiceInstaller
{
    internal const string InstallConfirmation = "INSTALL-FAROL-GUARDIAN";
    internal const string RemoveConfirmation = "REMOVE-FAROL-GUARDIAN";
    private const uint ScManagerConnect = 0x0001;
    private const uint ScManagerCreateService = 0x0002;
    private const uint ServiceAllAccess = 0x000F01FF;
    private const uint ServiceWin32OwnProcess = 0x00000010;
    private const uint ServiceDemandStart = 0x00000003;
    private const uint ServiceErrorNormal = 0x00000001;
    private const uint ServiceStop = 0x0020;
    private const uint ServiceQueryStatus = 0x0004;
    private const uint Delete = 0x00010000;
    private const uint ServiceSidTypeRestricted = 3;
    private const int ErrorServiceDoesNotExist = 1060;
    private const int ErrorServiceNotActive = 1062;

    internal static object Plan()
    {
        var executablePath = Environment.ProcessPath ?? string.Empty;
        var approvedDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Farol IA Local",
            "Guardian");
        var expectedExecutable = Path.Combine(approvedDirectory, "Farol.NetworkGuardian.exe");
        var approvedLocation = string.Equals(
            Path.GetFullPath(executablePath),
            Path.GetFullPath(expectedExecutable),
            StringComparison.OrdinalIgnoreCase);

        return new
        {
            serviceName = GuardianServiceHost.ServiceName,
            displayName = "Farol IA - Guardião de Rede",
            executablePath,
            expectedExecutable,
            approvedLocation,
            elevated = IsElevated(),
            startMode = "manual-until-wfp-enforcement-is-tested",
            account = "LocalSystem with restricted service SID",
            serviceSidType = "restricted",
            startsImmediately = false,
            installsFilters = false,
            canInstall = approvedLocation && IsElevated(),
            message = approvedLocation
                ? "Local de instalação aprovado. A elevação administrativa ainda é obrigatória."
                : "Instalação bloqueada: publique o executável no diretório seguro indicado."
        };
    }

    internal static object Install(string confirmation)
    {
        if (!string.Equals(confirmation, InstallConfirmation, StringComparison.Ordinal))
            throw new InvalidOperationException("Confirmação de instalação inválida.");
        if (!IsElevated())
            throw new UnauthorizedAccessException("A instalação do serviço exige elevação administrativa.");

        var plan = PlanValues();
        if (!plan.ApprovedLocation)
            throw new InvalidOperationException($"Instalação permitida somente em: {plan.ExpectedExecutable}");

        var manager = ServiceInstallerNative.OpenSCManager(null, null, ScManagerCreateService);
        if (manager == IntPtr.Zero) throw LastError("Não foi possível abrir o Gerenciador de Serviços.");
        IntPtr service = IntPtr.Zero;
        try
        {
            var commandLine = $"\"{plan.ExecutablePath}\" service-run";
            service = ServiceInstallerNative.CreateService(
                manager,
                GuardianServiceHost.ServiceName,
                "Farol IA - Guardião de Rede",
                ServiceAllAccess,
                ServiceWin32OwnProcess,
                ServiceDemandStart,
                ServiceErrorNormal,
                commandLine,
                null,
                IntPtr.Zero,
                null,
                null,
                null);
            if (service == IntPtr.Zero) throw LastError("Não foi possível criar o serviço.");

            var sidInfo = new ServiceSidInfo { ServiceSidType = ServiceSidTypeRestricted };
            if (!ServiceInstallerNative.ChangeServiceConfig2Sid(service, 5, ref sidInfo))
                throw LastError("Não foi possível restringir o SID do serviço.");

            var description = new ServiceDescription
            {
                Description = "Aplica políticas locais de rede aprovadas pelo usuário para o Farol IA."
            };
            if (!ServiceInstallerNative.ChangeServiceConfig2Description(service, 1, ref description))
                throw LastError("Não foi possível definir a descrição do serviço.");

            return new
            {
                installed = true,
                serviceName = GuardianServiceHost.ServiceName,
                startMode = "manual",
                started = false,
                filtersInstalled = false,
                message = "Serviço registrado, mas não iniciado. Nenhum filtro WFP foi instalado."
            };
        }
        catch
        {
            if (service != IntPtr.Zero) ServiceInstallerNative.DeleteService(service);
            throw;
        }
        finally
        {
            if (service != IntPtr.Zero) ServiceInstallerNative.CloseServiceHandle(service);
            ServiceInstallerNative.CloseServiceHandle(manager);
        }
    }

    internal static object Uninstall(string confirmation)
    {
        if (!string.Equals(confirmation, RemoveConfirmation, StringComparison.Ordinal))
            throw new InvalidOperationException("Confirmação de remoção inválida.");
        if (!IsElevated())
            throw new UnauthorizedAccessException("A remoção do serviço exige elevação administrativa.");

        var manager = ServiceInstallerNative.OpenSCManager(null, null, ScManagerConnect);
        if (manager == IntPtr.Zero) throw LastError("Não foi possível abrir o Gerenciador de Serviços.");
        try
        {
            var service = ServiceInstallerNative.OpenService(
                manager,
                GuardianServiceHost.ServiceName,
                Delete | ServiceStop | ServiceQueryStatus);
            if (service == IntPtr.Zero)
            {
                var error = Marshal.GetLastWin32Error();
                if (error == ErrorServiceDoesNotExist)
                    return new { removed = true, alreadyAbsent = true, message = "O serviço já não estava instalado." };
                throw new Win32Exception(error, "Não foi possível abrir o serviço para remoção.");
            }
            try
            {
                var status = new ServiceStatus();
                if (!ServiceInstallerNative.ControlService(service, ServiceControl.Stop, ref status))
                {
                    var error = Marshal.GetLastWin32Error();
                    if (error != ErrorServiceNotActive)
                        throw new Win32Exception(error, "Não foi possível solicitar a parada do serviço.");
                }
                if (!ServiceInstallerNative.DeleteService(service))
                    throw LastError("Não foi possível marcar o serviço para remoção.");
                return new { removed = true, alreadyAbsent = false, message = "Serviço parado e marcado para remoção." };
            }
            finally
            {
                ServiceInstallerNative.CloseServiceHandle(service);
            }
        }
        finally
        {
            ServiceInstallerNative.CloseServiceHandle(manager);
        }
    }

    private static (string ExecutablePath, string ExpectedExecutable, bool ApprovedLocation) PlanValues()
    {
        var executablePath = Environment.ProcessPath ?? string.Empty;
        var expectedExecutable = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Farol IA Local",
            "Guardian",
            "Farol.NetworkGuardian.exe");
        return (executablePath, expectedExecutable, string.Equals(
            Path.GetFullPath(executablePath),
            Path.GetFullPath(expectedExecutable),
            StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static Win32Exception LastError(string message) => new(Marshal.GetLastWin32Error(), message);
}

[StructLayout(LayoutKind.Sequential)]
internal struct ServiceSidInfo
{
    internal uint ServiceSidType;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct ServiceDescription
{
    [MarshalAs(UnmanagedType.LPWStr)] internal string? Description;
}

internal static class ServiceInstallerNative
{
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr OpenSCManager(string? machineName, string? databaseName, uint desiredAccess);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr CreateService(
        IntPtr serviceManager,
        string serviceName,
        string displayName,
        uint desiredAccess,
        uint serviceType,
        uint startType,
        uint errorControl,
        string binaryPathName,
        string? loadOrderGroup,
        IntPtr tagId,
        string? dependencies,
        string? serviceStartName,
        string? password);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr OpenService(IntPtr serviceManager, string serviceName, uint desiredAccess);

    [DllImport("advapi32.dll", EntryPoint = "ChangeServiceConfig2W", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ChangeServiceConfig2Sid(IntPtr service, uint infoLevel, ref ServiceSidInfo info);

    [DllImport("advapi32.dll", EntryPoint = "ChangeServiceConfig2W", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ChangeServiceConfig2Description(IntPtr service, uint infoLevel, ref ServiceDescription info);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool ControlService(IntPtr service, uint control, ref ServiceStatus status);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DeleteService(IntPtr service);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseServiceHandle(IntPtr serviceHandle);
}
