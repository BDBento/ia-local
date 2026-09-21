using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;
using Farol.NetworkGuardian;

const string ProtocolVersion = "2";

var command = args.FirstOrDefault()?.Trim().ToLowerInvariant() ?? "status";
if (command == "plan")
{
    var appIndex = Array.FindIndex(args, value => string.Equals(value, "--app", StringComparison.OrdinalIgnoreCase));
    if (appIndex < 0 || appIndex + 1 >= args.Length)
    {
        WriteJson(new { protocolVersion = ProtocolVersion, ok = false, error = "missing_app", message = "Informe --app seguido do caminho completo do executável." });
        return 2;
    }
    try
    {
        WriteJson(new { protocolVersion = ProtocolVersion, ok = true, plan = WfpPolicyPlanner.Create(args[appIndex + 1]) });
        return 0;
    }
    catch (Exception error) when (error is ArgumentException or IOException or InvalidOperationException or PlatformNotSupportedException)
    {
        WriteJson(new { protocolVersion = ProtocolVersion, ok = false, error = "invalid_plan", message = error.Message });
        return 3;
    }
}

if (command != "status")
{
    WriteJson(new
    {
        protocolVersion = ProtocolVersion,
        ok = false,
        error = "unsupported_command",
        message = "O Guardião ainda não aplica regras WFP; somente status e plan são permitidos."
    });
    return 2;
}

var wfp = ProbeLibraryExport("fwpuclnt.dll", "FwpmEngineOpen0");
var wfpManagement = ProbeWfpManagementApi();
var wfpEngine = ProbeWfpEngine();
var sandbox = ProbeLibraryExport("processmodel.dll", "Experimental_CreateProcessInSandbox");
var elevated = IsElevated();
var windowsBuild = Environment.OSVersion.Version.Build;

WriteJson(new
{
    protocolVersion = ProtocolVersion,
    ok = true,
    platform = "windows",
    windowsBuild,
    elevated,
    capabilities = new
    {
        wfpAvailable = wfp.ExportFound,
        wfpEngineAccessible = wfpEngine.Accessible,
        wfpEngineErrorCode = wfpEngine.ErrorCode,
        applicationIdentityFiltering = wfp.ExportFound,
        dynamicSessionCleanup = wfp.ExportFound,
        wfpManagementApiAvailable = wfpManagement,
        enforcerReadyForInstallation = false,
        sandboxApiAvailable = sandbox.ExportFound,
        dotnetRuntime = Environment.Version.ToString()
    },
    policy = new
    {
        defaultNetwork = "deny",
        terminalEnabled = false,
        enforcement = "diagnostic-only",
        authorizationMode = "human-required",
        filterState = "not-installed",
        externalAccess = false
    },
    message = wfpEngine.Accessible
        ? "WFP acessível. O planejador valida executáveis, mas nenhum filtro é instalado sem o serviço nativo."
        : wfp.ExportFound
            ? $"WFP disponível, mas o mecanismo não pôde ser aberto (código {wfpEngine.ErrorCode}). Terminal bloqueado."
            : "WFP indisponível. Terminal bloqueado por falha segura."
});

return 0;

static (bool Loaded, bool ExportFound) ProbeLibraryExport(string library, string export)
{
    if (!OperatingSystem.IsWindows()) return (false, false);
    if (!NativeLibrary.TryLoad(library, out var handle)) return (false, false);
    try
    {
        return (true, NativeLibrary.TryGetExport(handle, export, out _));
    }
    finally
    {
        NativeLibrary.Free(handle);
    }
}

static bool ProbeWfpManagementApi()
{
    if (!OperatingSystem.IsWindows()) return false;
    if (!NativeLibrary.TryLoad("fwpuclnt.dll", out var handle)) return false;
    try
    {
        var exports = new[]
        {
            "FwpmEngineOpen0",
            "FwpmGetAppIdFromFileName0",
            "FwpmProviderAdd0",
            "FwpmSubLayerAdd0",
            "FwpmFilterAdd0",
            "FwpmTransactionBegin0",
            "FwpmTransactionCommit0",
            "FwpmTransactionAbort0"
        };
        return exports.All(export => NativeLibrary.TryGetExport(handle, export, out _));
    }
    finally
    {
        NativeLibrary.Free(handle);
    }
}

static (bool Accessible, uint ErrorCode) ProbeWfpEngine()
{
    if (!OperatingSystem.IsWindows()) return (false, 50);
    var result = NativeMethods.FwpmEngineOpen0(null, 10, IntPtr.Zero, IntPtr.Zero, out var engineHandle);
    if (result != 0) return (false, result);
    try
    {
        return (true, 0);
    }
    finally
    {
        if (engineHandle != IntPtr.Zero) NativeMethods.FwpmEngineClose0(engineHandle);
    }
}

static bool IsElevated()
{
    if (!OperatingSystem.IsWindows()) return false;
    try
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }
    catch
    {
        return false;
    }
}

static void WriteJson<T>(T value)
{
    var options = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };
    Console.Out.WriteLine(JsonSerializer.Serialize(value, options));
}

internal static class NativeMethods
{
    [DllImport("fwpuclnt.dll", CharSet = CharSet.Unicode)]
    internal static extern uint FwpmEngineOpen0(
        string? serverName,
        uint authnService,
        IntPtr authIdentity,
        IntPtr session,
        out IntPtr engineHandle);

    [DllImport("fwpuclnt.dll")]
    internal static extern uint FwpmEngineClose0(IntPtr engineHandle);
}
