using System.Security.Cryptography;
using System.Text;

namespace SocialMedia.Api.Infrastructure;

/// <summary>
/// Encrypts OAuth tokens at rest. Tokens must never be stored or logged in plaintext,
/// and are never returned by the API.
/// </summary>
public interface ITokenVault
{
    string Encrypt(string plaintext);
    string Decrypt(string ciphertext);
}

/// <summary>
/// AES-256-GCM. Payload layout: base64(nonce[12] | tag[16] | ciphertext).
/// Key comes from TokenVault:Key (base64, 32 bytes). In Development a deterministic
/// dev key is derived so the app runs without secrets — never rely on that in prod.
/// </summary>
public sealed class AesGcmTokenVault : ITokenVault
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public AesGcmTokenVault(IConfiguration config, IHostEnvironment env, ILogger<AesGcmTokenVault> logger)
    {
        var configured = config["TokenVault:Key"];
        if (!string.IsNullOrEmpty(configured))
        {
            _key = Convert.FromBase64String(configured);
            if (_key.Length != 32)
                throw new InvalidOperationException("TokenVault:Key must be 32 bytes (base64-encoded).");
        }
        else if (env.IsDevelopment())
        {
            logger.LogWarning("TokenVault:Key not set — using an insecure development key.");
            _key = SHA256.HashData(Encoding.UTF8.GetBytes("social-media-dev-only-key"));
        }
        else
        {
            throw new InvalidOperationException(
                "TokenVault:Key is required outside Development. Generate one with: " +
                "openssl rand -base64 32");
        }
    }

    public string Encrypt(string plaintext)
    {
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        var payload = new byte[NonceSize + TagSize + cipherBytes.Length];
        nonce.CopyTo(payload, 0);
        tag.CopyTo(payload, NonceSize);
        cipherBytes.CopyTo(payload, NonceSize + TagSize);
        return Convert.ToBase64String(payload);
    }

    public string Decrypt(string ciphertext)
    {
        var payload = Convert.FromBase64String(ciphertext);
        var nonce = payload.AsSpan(0, NonceSize);
        var tag = payload.AsSpan(NonceSize, TagSize);
        var cipherBytes = payload.AsSpan(NonceSize + TagSize);
        var plainBytes = new byte[cipherBytes.Length];

        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, cipherBytes, tag, plainBytes);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
