using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Farol.NetworkGuardian;

internal static class WfpPolicyPlanner
{
    internal static object Create(string applicationPath)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("O planejamento WFP requer Windows.");

        var fullPath = Path.GetFullPath(applicationPath ?? string.Empty);
        if (!File.Exists(fullPath))
            throw new FileNotFoundException("O executável informado não existe.", fullPath);
        if (!string.Equals(Path.GetExtension(fullPath), ".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("A política WFP aceita somente um executável .exe.");

        var result = WfpPlanNative.FwpmGetAppIdFromFileName0(fullPath, out var appIdPointer);
        if (result != 0 || appIdPointer == IntPtr.Zero)
            throw new InvalidOperationException($"Não foi possível obter a identidade WFP do aplicativo (código {result}).");

        try
        {
            var blob = Marshal.PtrToStructure<FwpByteBlob>(appIdPointer);
            if (blob.Size == 0 || blob.Data == IntPtr.Zero)
                throw new InvalidOperationException("O Windows retornou uma identidade WFP vazia.");

            var bytes = new byte[blob.Size];
            Marshal.Copy(blob.Data, bytes, 0, checked((int)blob.Size));
            var fingerprint = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

            return new
            {
                applicationPath = fullPath,
                applicationIdSha256 = fingerprint,
                layers = new[] { "ALE_AUTH_CONNECT_V4", "ALE_AUTH_CONNECT_V6" },
                condition = "ALE_APP_ID",
                basePolicy = "persistent-block",
                temporaryGrant = "dynamic-session-permit",
                failClosedOnGrantProcessExit = true,
                requiresAdministrator = true,
                requiresInstalledService = true,
                applied = false,
                message = "Plano validado. Nenhum filtro foi instalado ou alterado."
            };
        }
        finally
        {
            WfpPlanNative.FwpmFreeMemory0(ref appIdPointer);
        }
    }
}

[StructLayout(LayoutKind.Sequential)]
internal struct FwpByteBlob
{
    internal uint Size;
    internal IntPtr Data;
}

internal static class WfpPlanNative
{
    [DllImport("fwpuclnt.dll", CharSet = CharSet.Unicode)]
    internal static extern uint FwpmGetAppIdFromFileName0(string fileName, out IntPtr appId);

    [DllImport("fwpuclnt.dll")]
    internal static extern void FwpmFreeMemory0(ref IntPtr memory);
}
