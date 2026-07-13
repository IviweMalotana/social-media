using System.Security.Cryptography;
using System.Text;

namespace SocialMedia.Api.Services;

/// <summary>
/// Verifies Resend webhook signatures (Resend signs with Svix: HMAC-SHA256 over
/// "{msg-id}.{timestamp}.{payload}" with the base64 secret after the whsec_ prefix).
/// </summary>
public static class SvixSignature
{
    public static readonly TimeSpan Tolerance = TimeSpan.FromMinutes(5);

    public static bool Verify(
        string secret, string msgId, string timestampHeader, string signatureHeader,
        string payload, DateTimeOffset? now = null)
    {
        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(msgId) ||
            string.IsNullOrEmpty(timestampHeader) || string.IsNullOrEmpty(signatureHeader))
            return false;

        // Replay protection: the timestamp is part of the signed content, so bounding
        // its age bounds how long a captured request stays valid.
        if (!long.TryParse(timestampHeader, out var unix)) return false;
        var timestamp = DateTimeOffset.FromUnixTimeSeconds(unix);
        var reference = now ?? DateTimeOffset.UtcNow;
        if ((reference - timestamp).Duration() > Tolerance) return false;

        byte[] key;
        try
        {
            key = Convert.FromBase64String(
                secret.StartsWith("whsec_") ? secret["whsec_".Length..] : secret);
        }
        catch (FormatException)
        {
            return false;
        }

        using var hmac = new HMACSHA256(key);
        var expected = Convert.ToBase64String(
            hmac.ComputeHash(Encoding.UTF8.GetBytes($"{msgId}.{timestampHeader}.{payload}")));
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        // Header carries space-separated "v1,<base64>" entries; any match passes.
        foreach (var part in signatureHeader.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var pieces = part.Split(',', 2);
            if (pieces.Length == 2 && pieces[0] == "v1" &&
                CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(pieces[1]), expectedBytes))
                return true;
        }
        return false;
    }

    /// <summary>Computes a valid "v1,..." signature — used by tests to sign fixtures.</summary>
    public static string Sign(string secret, string msgId, string timestampHeader, string payload)
    {
        var key = Convert.FromBase64String(
            secret.StartsWith("whsec_") ? secret["whsec_".Length..] : secret);
        using var hmac = new HMACSHA256(key);
        return "v1," + Convert.ToBase64String(
            hmac.ComputeHash(Encoding.UTF8.GetBytes($"{msgId}.{timestampHeader}.{payload}")));
    }
}
