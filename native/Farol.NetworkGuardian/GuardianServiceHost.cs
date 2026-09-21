using System.Runtime.InteropServices;

namespace Farol.NetworkGuardian;

internal enum GuardianLifecycleState
{
    Created,
    StartPending,
    RunningLocked,
    StopPending,
    Stopped
}

internal sealed class GuardianServiceState
{
    internal GuardianLifecycleState State { get; private set; } = GuardianLifecycleState.Created;
    internal string DefaultNetwork => "deny";
    internal bool TerminalEnabled => false;
    internal bool FiltersActive => false;

    internal void BeginStart()
    {
        if (State != GuardianLifecycleState.Created) throw new InvalidOperationException("Transição de início inválida.");
        State = GuardianLifecycleState.StartPending;
    }

    internal void CompleteStart()
    {
        if (State != GuardianLifecycleState.StartPending) throw new InvalidOperationException("Conclusão de início inválida.");
        State = GuardianLifecycleState.RunningLocked;
    }

    internal void BeginStop()
    {
        if (State != GuardianLifecycleState.RunningLocked) throw new InvalidOperationException("Transição de parada inválida.");
        State = GuardianLifecycleState.StopPending;
    }

    internal void CompleteStop()
    {
        if (State != GuardianLifecycleState.StopPending) throw new InvalidOperationException("Conclusão de parada inválida.");
        State = GuardianLifecycleState.Stopped;
    }
}

internal static class GuardianServiceHost
{
    internal const string ServiceName = "FarolNetworkGuardian";
    private static readonly ManualResetEventSlim StopEvent = new(false);
    private static readonly GuardianServiceState State = new();
    private static readonly ServiceMainDelegate ServiceMainCallback = ServiceMain;
    private static readonly HandlerExDelegate HandlerCallback = Handler;
    private static IntPtr statusHandle;

    internal static object SelfTest()
    {
        var state = new GuardianServiceState();
        state.BeginStart();
        state.CompleteStart();
        var lockedSnapshot = new
        {
            state = state.State.ToString(),
            defaultNetwork = state.DefaultNetwork,
            terminalEnabled = state.TerminalEnabled,
            filtersActive = state.FiltersActive
        };
        state.BeginStop();
        state.CompleteStop();
        return new
        {
            ok = lockedSnapshot.defaultNetwork == "deny" && !lockedSnapshot.terminalEnabled && !lockedSnapshot.filtersActive,
            serviceName = ServiceName,
            runningSnapshot = lockedSnapshot,
            finalState = state.State.ToString(),
            scmRegistered = false,
            message = "Ciclo de vida validado em memória. O serviço não foi instalado nem iniciado pelo SCM."
        };
    }

    internal static uint RunDispatcher()
    {
        if (!OperatingSystem.IsWindows()) return 50;
        var table = new[]
        {
            new ServiceTableEntry { ServiceName = ServiceName, ServiceMain = ServiceMainCallback },
            new ServiceTableEntry { ServiceName = null, ServiceMain = null }
        };
        return ServiceNative.StartServiceCtrlDispatcher(table) ? 0u : (uint)Marshal.GetLastWin32Error();
    }

    private static void ServiceMain(uint argumentCount, IntPtr arguments)
    {
        statusHandle = ServiceNative.RegisterServiceCtrlHandlerEx(ServiceName, HandlerCallback, IntPtr.Zero);
        if (statusHandle == IntPtr.Zero) return;

        State.BeginStart();
        Report(ServiceState.StartPending, 0, 3000);
        State.CompleteStart();
        Report(ServiceState.Running, ServiceAccept.Stop | ServiceAccept.Shutdown, 0);

        StopEvent.Wait();

        State.CompleteStop();
        Report(ServiceState.Stopped, 0, 0);
    }

    private static uint Handler(uint control, uint eventType, IntPtr eventData, IntPtr context)
    {
        if (control is ServiceControl.Stop or ServiceControl.Shutdown)
        {
            if (State.State == GuardianLifecycleState.RunningLocked)
            {
                State.BeginStop();
                Report(ServiceState.StopPending, 0, 3000);
                StopEvent.Set();
            }
            return 0;
        }
        return 0;
    }

    private static void Report(uint currentState, uint controlsAccepted, uint waitHint)
    {
        var status = new ServiceStatus
        {
            ServiceType = 0x10,
            CurrentState = currentState,
            ControlsAccepted = controlsAccepted,
            Win32ExitCode = 0,
            ServiceSpecificExitCode = 0,
            CheckPoint = currentState is ServiceState.StartPending or ServiceState.StopPending ? 1u : 0u,
            WaitHint = waitHint
        };
        ServiceNative.SetServiceStatus(statusHandle, ref status);
    }
}

internal static class ServiceState
{
    internal const uint Stopped = 1;
    internal const uint StartPending = 2;
    internal const uint StopPending = 3;
    internal const uint Running = 4;
}

internal static class ServiceControl
{
    internal const uint Stop = 1;
    internal const uint Shutdown = 5;
}

internal static class ServiceAccept
{
    internal const uint Stop = 1;
    internal const uint Shutdown = 4;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct ServiceTableEntry
{
    [MarshalAs(UnmanagedType.LPWStr)] internal string? ServiceName;
    [MarshalAs(UnmanagedType.FunctionPtr)] internal ServiceMainDelegate? ServiceMain;
}

[StructLayout(LayoutKind.Sequential)]
internal struct ServiceStatus
{
    internal uint ServiceType;
    internal uint CurrentState;
    internal uint ControlsAccepted;
    internal uint Win32ExitCode;
    internal uint ServiceSpecificExitCode;
    internal uint CheckPoint;
    internal uint WaitHint;
}

[UnmanagedFunctionPointer(CallingConvention.Winapi)]
internal delegate void ServiceMainDelegate(uint argumentCount, IntPtr arguments);

[UnmanagedFunctionPointer(CallingConvention.Winapi)]
internal delegate uint HandlerExDelegate(uint control, uint eventType, IntPtr eventData, IntPtr context);

internal static class ServiceNative
{
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool StartServiceCtrlDispatcher([In] ServiceTableEntry[] serviceTable);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr RegisterServiceCtrlHandlerEx(
        string serviceName,
        HandlerExDelegate handlerProc,
        IntPtr context);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetServiceStatus(IntPtr serviceStatusHandle, ref ServiceStatus serviceStatus);
}
