using System.Security.Cryptography;
using System.Text;
using SocialMedia.Api.Controllers;

namespace SocialMedia.Api.Tests;

public class MetaComplianceTests
{
    private const string Secret = "test-app-secret";

    private static string MakeSignedRequest(string payloadJson, string secret)
    {
        var payload = Base64Url(Encoding.UTF8.GetBytes(payloadJson));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var signature = Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
        return $"{signature}.{payload}";
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public void Valid_signed_request_returns_user_id()
    {
        var signed = MakeSignedRequest("""{"user_id":"1234567890","algorithm":"HMAC-SHA256"}""", Secret);
        Assert.Equal("1234567890", MetaComplianceController.ParseSignedRequest(signed, Secret));
    }

    [Fact]
    public void Wrong_secret_is_rejected()
    {
        var signed = MakeSignedRequest("""{"user_id":"1234567890"}""", "other-secret");
        Assert.Throws<InvalidOperationException>(
            () => MetaComplianceController.ParseSignedRequest(signed, Secret));
    }

    [Fact]
    public void Tampered_payload_is_rejected()
    {
        var signed = MakeSignedRequest("""{"user_id":"1234567890"}""", Secret);
        var parts = signed.Split('.');
        var tamperedPayload = Base64Url(Encoding.UTF8.GetBytes("""{"user_id":"9999999999"}"""));
        Assert.Throws<InvalidOperationException>(
            () => MetaComplianceController.ParseSignedRequest($"{parts[0]}.{tamperedPayload}", Secret));
    }

    [Fact]
    public void Malformed_input_is_rejected()
    {
        Assert.ThrowsAny<Exception>(
            () => MetaComplianceController.ParseSignedRequest("not-a-signed-request", Secret));
    }
}
