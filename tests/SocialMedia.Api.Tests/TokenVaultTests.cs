using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Tests;

public class TokenVaultTests
{
    private static AesGcmTokenVault CreateVault()
    {
        var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["TokenVault:Key"] = key })
            .Build();
        return new AesGcmTokenVault(config, new FakeEnvironment(), NullLogger<AesGcmTokenVault>.Instance);
    }

    [Fact]
    public void Roundtrip_returns_original_token()
    {
        var vault = CreateVault();
        const string token = "EAABsbCS1iHgBO7Zsecret-oauth-token";

        var encrypted = vault.Encrypt(token);

        Assert.NotEqual(token, encrypted);
        Assert.Equal(token, vault.Decrypt(encrypted));
    }

    [Fact]
    public void Same_plaintext_encrypts_differently_each_time()
    {
        var vault = CreateVault();
        Assert.NotEqual(vault.Encrypt("token"), vault.Encrypt("token"));
    }

    [Fact]
    public void Tampered_ciphertext_fails_authentication()
    {
        var vault = CreateVault();
        var payload = Convert.FromBase64String(vault.Encrypt("token"));
        payload[^1] ^= 0xFF; // flip a ciphertext bit

        Assert.ThrowsAny<CryptographicException>(
            () => vault.Decrypt(Convert.ToBase64String(payload)));
    }

    [Fact]
    public void Rejects_wrong_key_length()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["TokenVault:Key"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)),
            })
            .Build();

        Assert.Throws<InvalidOperationException>(() =>
            new AesGcmTokenVault(config, new FakeEnvironment(), NullLogger<AesGcmTokenVault>.Instance));
    }

    private sealed class FakeEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = ".";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
