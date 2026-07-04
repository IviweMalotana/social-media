using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Auth;

/// <summary>PBKDF2-SHA256 password hashing. Format: {iterations}.{salt-b64}.{hash-b64}</summary>
public static class PasswordHasher
{
    private const int Iterations = 100_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 3) return false;
        var iterations = int.Parse(parts[0]);
        var salt = Convert.FromBase64String(parts[1]);
        var expected = Convert.FromBase64String(parts[2]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

public class JwtTokenService(IConfiguration config)
{
    public string Issue(AppUser user, Guid workspaceId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetSigningKey(config)));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"] ?? "social-media",
            audience: config["Jwt:Audience"] ?? "social-media",
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim("workspace", workspaceId.ToString()),
            ],
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static string GetSigningKey(IConfiguration config)
    {
        var key = config["Jwt:Key"];
        return string.IsNullOrEmpty(key) ? "dev-only-signing-key-change-me-in-production!!" : key;
    }
}

public static class ClaimsExtensions
{
    public static Guid UserId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? throw new UnauthorizedAccessException("Missing subject claim."));

    public static Guid WorkspaceId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue("workspace")
            ?? throw new UnauthorizedAccessException("Missing workspace claim."));
}
