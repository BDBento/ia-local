using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;

const string ProtocolVersion = "1";

var command = args.FirstOrDefault()?.Trim().ToLowerInvariant() ?? "status";
if (command != "status")
{
    WriteJson(new
    {
        protocolVersion = ProtocolVersion,
        ok = false,
        error = "unsupported_command",
        message = "O Guardião está em modo de diagnóstico; nenhuma alteração de rede é permitida."
    });
    return 2;
}

var wfp = ProbeLibraryExport("fwpuclnt.dll", "FwpmEngineOpen0");
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
        sandboxApiAvailable = sandbox.ExportFound,
        dotnetRuntime = Environment.Version.ToString()
    },
    policy = new
    {
        defaultNetwork = "deny",
        terminalEnabled = false,
        enforcement = "diagnostic-only",
        externalAccess = false
    },
    message = wfp.ExportFound
        ? "WFP disponível. O enforcer ainda não foi instalado; terminal bloqueado."
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
