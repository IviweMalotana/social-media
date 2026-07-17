using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Tests;

public class EmailDesignerTests
{
    private const string Blocks = """
        [
          {"type":"offerBar","text":"Free shipping over R850"},
          {"type":"hero","headline":"From 10 units.\nLive pricing.","subline":"No quote round-trips.","ctaText":"Shop now","ctaUrl":"https://example.com"},
          {"type":"timeline","title":"What to expect","steps":[{"label":"Today","text":"Order online"}]},
          {"type":"proof","quote":"Great supplier","attribution":"Real Customer"}
        ]
        """;

    [Fact]
    public void Render_produces_branded_html_and_text_twin_with_footer()
    {
        var (html, text) = EmailDesigner.Render(
            "Preview line here", """{"accent":"#123456"}""", Blocks,
            "Be Different Packaging", "16 Beach Road, Strand");

        // Structure: preheader hidden, accent applied, blocks present, CTA button.
        Assert.Contains("Preview line here", html);
        Assert.Contains("#123456", html);
        Assert.Contains("FREE SHIPPING OVER R850".ToLowerInvariant(), html.ToLowerInvariant());
        Assert.Contains("From 10 units.", html);
        Assert.Contains("href=\"https://example.com\"", html);
        Assert.Contains("What to expect", html);
        Assert.Contains("Great supplier", html);
        // Compliance footer is always appended with the per-recipient placeholder.
        Assert.Contains("16 Beach Road, Strand", html);
        Assert.Contains(EmailDesigner.UnsubscribePlaceholder, html);
        // Text twin carries the same content.
        Assert.Contains("From 10 units.", text);
        Assert.Contains("Shop now: https://example.com", text);
        Assert.Contains(EmailDesigner.UnsubscribePlaceholder, text);
    }

    [Fact]
    public void Render_includes_hero_image_when_url_is_present()
    {
        var blocks = """
            [{"type":"hero","headline":"MEET IT.","subline":"","imageUrl":"https://cdn.example.com/hero.jpg","ctaText":"BE FIRST","ctaUrl":"https://example.com"}]
            """;
        var (html, _) = EmailDesigner.Render("", "{}", blocks, "BDP", null);
        Assert.Contains("<img src=\"https://cdn.example.com/hero.jpg\"", html);
        Assert.Contains("alt=\"MEET IT.\"", html);
    }

    [Fact]
    public void Render_omits_hero_image_when_url_is_missing()
    {
        var blocks = """
            [{"type":"hero","headline":"MEET IT.","subline":"sub","ctaText":"BE FIRST","ctaUrl":"https://example.com"}]
            """;
        var (html, _) = EmailDesigner.Render("", "{}", blocks, "BDP", null);
        Assert.DoesNotContain("<img", html);
    }

    [Fact]
    public void Render_supports_new_block_types_iconrow_marquee_storyimage()
    {
        var blocks = """
            [
              {"type":"marquee","text":"+ NEW LAUNCH +"},
              {"type":"iconRow","title":"Formulated for indie brands","items":[
                {"icon":"10","label":"FROM 10 UNITS"},
                {"icon":"★","label":"4.9 STAR ETSY"}
              ]},
              {"type":"storyImage","imageUrl":"https://cdn.example.com/story.jpg","heading":"Why we started","body":"Founder story."}
            ]
            """;
        var (html, text) = EmailDesigner.Render("", "{}", blocks, "BDP", null);
        // Marquee renders on the ink strip.
        Assert.Contains("+ NEW LAUNCH +", html);
        // Icon row circles + labels.
        Assert.Contains("border-radius:50%", html);
        Assert.Contains("FROM 10 UNITS", html);
        Assert.Contains("4.9 STAR ETSY", html);
        // Story image + heading.
        Assert.Contains("<img src=\"https://cdn.example.com/story.jpg\"", html);
        Assert.Contains("Why we started", html);
        // Text twin mirrors the icon labels for accessibility.
        Assert.Contains("[10] FROM 10 UNITS", text);
    }

    [Fact]
    public void Render_applies_section_bg_variants_to_text_and_bullets()
    {
        var blocks = """
            [
              {"type":"text","heading":"H","body":"b","bg":"sand"},
              {"type":"bullets","title":"T","items":["x"],"bg":"blush"}
            ]
            """;
        var (html, _) = EmailDesigner.Render("", "{}", blocks, "BDP", null);
        // Sand background = brand.Bg default (#EFEDE9).
        Assert.Contains("background:#EFEDE9;padding:8px 28px 26px", html);
        // Blush background = brand.Accent default (#E0BEB1).
        Assert.Contains("background:#E0BEB1;padding:14px 28px 24px", html);
    }

    [Fact]
    public void Render_escapes_html_in_user_content()
    {
        var (html, _) = EmailDesigner.Render(
            "", "{}", """[{"type":"text","heading":"<script>x</script>","body":"a & b"}]""",
            "BDP", null);
        Assert.DoesNotContain("<script>", html);
        Assert.Contains("&lt;script&gt;", html);
        Assert.Contains("a &amp; b", html);
    }

    [Fact]
    public void Render_tolerates_malformed_json()
    {
        var (html, text) = EmailDesigner.Render("", "not json", "also not json", "BDP", null);
        Assert.Contains(EmailDesigner.UnsubscribePlaceholder, html); // footer still renders
        Assert.NotEmpty(text);
    }

    [Fact]
    public async Task SendRendered_replaces_placeholder_and_keeps_guards()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"designs-{Guid.NewGuid()}").Options);
        var workspaceId = Guid.NewGuid();
        var prospect = new Prospect
        {
            WorkspaceId = workspaceId,
            CompanyName = "Won Hotel",
            Email = "sam@wonhotel.co.za",
            Status = ProspectStatus.Won,
        };
        db.Prospects.Add(prospect);
        await db.SaveChangesAsync();
        var transport = new EmailServiceTests.FakeTransport();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Resend:ApiKey"] = "re_test",
            ["Email:FromAddress"] = "ivi@bedifferentpackaging.com",
            ["App:BaseUrl"] = "https://api.example.com",
        }).Build();
        var service = new EmailService(db, transport, config);

        var (html, text) = EmailDesigner.Render("", "{}", Blocks, "BDP", "Strand");
        var (code, _) = await service.SendRenderedAsync(
            workspaceId, prospect, "new: frosted jars", text, html);

        Assert.Equal(200, code);
        var sent = transport.Sent.Single();
        Assert.DoesNotContain(EmailDesigner.UnsubscribePlaceholder, sent.Text);
        Assert.DoesNotContain(EmailDesigner.UnsubscribePlaceholder, sent.Html!);
        Assert.Contains($"https://api.example.com/api/unsubscribe/{prospect.UnsubscribeToken}", sent.Html!);
        Assert.NotNull(sent.Headers); // one-click headers present

        // Guards still bite: unfilled [placeholder] in content blocks is refused.
        var (badHtml, badText) = EmailDesigner.Render(
            "", "{}", """[{"type":"text","heading":"x","body":"[fill me]"}]""", "BDP", null);
        var (badCode, _) = await service.SendRenderedAsync(
            workspaceId, prospect, "s", badText, badHtml);
        Assert.Equal(400, badCode);
    }
}
