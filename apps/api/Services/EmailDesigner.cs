using System.Text;
using System.Text.Json;
using static System.Net.WebUtility;

namespace SocialMedia.Api.Services;

public record EmailBrand(string Accent, string Bg, string Card, string Ink, string Muted, string? LogoUrl)
{
    public static readonly EmailBrand Default = new(
        Accent: "#C2703E", Bg: "#FAF6F0", Card: "#FFFFFF",
        Ink: "#26221E", Muted: "#8A8178", LogoUrl: null);

    public static EmailBrand Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string Get(string name, string fallback) =>
                root.TryGetProperty(name, out var v) && v.GetString() is { Length: > 0 } s ? s : fallback;
            return new EmailBrand(
                Get("accent", Default.Accent), Get("bg", Default.Bg), Get("card", Default.Card),
                Get("ink", Default.Ink), Get("muted", Default.Muted),
                root.TryGetProperty("logoUrl", out var l) && l.GetString() is { Length: > 0 } u ? u : null);
        }
        catch (JsonException)
        {
            return Default;
        }
    }
}

/// <summary>
/// Renders a designed email (the Lemme skeleton: offer bar → logo → hero →
/// content blocks → compliance footer) to email-safe HTML + a plain-text twin.
/// Single 600px column, all styles inline, serif display type, one accent color.
/// The per-recipient unsubscribe URL is injected later via the {{unsubscribeUrl}}
/// placeholder so one render serves every recipient.
/// </summary>
public static class EmailDesigner
{
    public const string UnsubscribePlaceholder = "{{unsubscribeUrl}}";

    private const string BodyFont = "Arial,'Helvetica Neue',Helvetica,sans-serif";
    private const string DisplayFont = "Georgia,'Times New Roman',serif";

    public static (string Html, string Text) Render(
        string preheader, string brandJson, string blocksJson,
        string identityName, string? physicalAddress)
    {
        var brand = EmailBrand.Parse(brandJson);
        var html = new StringBuilder();
        var text = new StringBuilder();

        html.Append("<!doctype html><html><body style=\"margin:0;padding:0;background:")
            .Append(brand.Bg).Append(";\">");
        if (preheader.Length > 0)
        {
            // Hidden preview line padded so inbox clients don't pull body text after it.
            html.Append("<div style=\"display:none;font-size:1px;color:").Append(brand.Bg)
                .Append(";line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;\">")
                .Append(HtmlEncode(preheader)).Append(new string('‌', 40)).Append("</div>");
            text.AppendLine(preheader).AppendLine();
        }
        html.Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:")
            .Append(brand.Bg).Append(";\"><tr><td align=\"center\" style=\"padding:0 0 32px;\">")
            .Append("<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:600px;max-width:100%;\">");

        foreach (var block in ParseBlocks(blocksJson))
            RenderBlock(html, text, block, brand, identityName);

        RenderFooter(html, text, brand, identityName, physicalAddress);

        html.Append("</table></td></tr></table></body></html>");
        return (html.ToString(), text.ToString().TrimEnd() + "\n");
    }

    private static List<JsonElement> ParseBlocks(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.EnumerateArray().Select(e => e.Clone()).ToList()
                : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string Prop(JsonElement block, string name) =>
        block.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? "" : "";

    private static void RenderBlock(
        StringBuilder html, StringBuilder text, JsonElement block, EmailBrand brand, string identityName)
    {
        switch (Prop(block, "type"))
        {
            case "offerBar":
            {
                var content = Prop(block, "text");
                if (content.Length == 0) break;
                Cell(html, $"background:{brand.Accent};padding:10px 16px;text-align:center;",
                    $"<span style=\"font-family:{BodyFont};font-size:12px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-transform:uppercase;\">{HtmlEncode(content)}</span>");
                text.AppendLine(content.ToUpperInvariant()).AppendLine();
                break;
            }
            case "logo":
            {
                var inner = brand.LogoUrl is { Length: > 0 } url
                    ? $"<img src=\"{HtmlEncode(url)}\" alt=\"{HtmlEncode(identityName)}\" width=\"160\" style=\"display:inline-block;max-width:160px;height:auto;\">"
                    : $"<span style=\"font-family:{DisplayFont};font-size:22px;color:{brand.Ink};\">{HtmlEncode(identityName)}</span>";
                Cell(html, $"background:{brand.Card};padding:22px 16px;text-align:center;", inner);
                text.AppendLine(identityName).AppendLine();
                break;
            }
            case "hero":
            {
                var headline = Prop(block, "headline");
                var subline = Prop(block, "subline");
                var inner = new StringBuilder();
                foreach (var line in headline.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                    inner.Append($"<div style=\"font-family:{DisplayFont};font-size:34px;line-height:1.15;color:{brand.Ink};\">{HtmlEncode(line.Trim())}</div>");
                if (subline.Length > 0)
                    inner.Append($"<div style=\"font-family:{BodyFont};font-size:15px;line-height:1.5;color:{brand.Muted};padding-top:12px;\">{HtmlEncode(subline)}</div>");
                AppendCta(inner, block, brand, padTop: 22);
                Cell(html, $"background:{brand.Card};padding:36px 28px 34px;text-align:center;", inner.ToString());
                text.AppendLine(headline.Replace('\n', ' ')).AppendLine(subline);
                AppendCtaText(text, block);
                text.AppendLine();
                break;
            }
            case "text":
            {
                var heading = Prop(block, "heading");
                var body = Prop(block, "body");
                var inner = new StringBuilder();
                if (heading.Length > 0)
                    inner.Append($"<div style=\"font-family:{DisplayFont};font-size:22px;color:{brand.Ink};padding-bottom:10px;\">{HtmlEncode(heading)}</div>");
                inner.Append($"<div style=\"font-family:{BodyFont};font-size:14px;line-height:1.6;color:{brand.Ink};\">{HtmlEncode(body).Replace("\n", "<br>")}</div>");
                Cell(html, $"background:{brand.Card};padding:8px 28px 26px;text-align:left;", inner.ToString());
                if (heading.Length > 0) text.AppendLine(heading.ToUpperInvariant());
                text.AppendLine(body).AppendLine();
                break;
            }
            case "timeline":
            {
                var title = Prop(block, "title");
                var inner = new StringBuilder();
                if (title.Length > 0)
                    inner.Append($"<div style=\"font-family:{DisplayFont};font-size:22px;color:{brand.Ink};text-align:center;padding-bottom:16px;\">{HtmlEncode(title)}</div>");
                if (block.TryGetProperty("steps", out var steps) && steps.ValueKind == JsonValueKind.Array)
                {
                    if (title.Length > 0) text.AppendLine(title.ToUpperInvariant());
                    foreach (var step in steps.EnumerateArray())
                    {
                        var label = Prop(step, "label");
                        var stepText = Prop(step, "text");
                        inner.Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>")
                            .Append($"<td width=\"110\" valign=\"top\" style=\"padding:6px 0;\"><span style=\"display:inline-block;font-family:{BodyFont};font-size:11px;font-weight:bold;letter-spacing:1px;color:{brand.Accent};border:1px solid {brand.Accent};border-radius:12px;padding:4px 10px;text-transform:uppercase;\">{HtmlEncode(label)}</span></td>")
                            .Append($"<td valign=\"top\" style=\"font-family:{BodyFont};font-size:14px;line-height:1.55;color:{brand.Ink};padding:8px 0 8px 10px;\">{HtmlEncode(stepText)}</td></tr></table>");
                        text.AppendLine($"{label}: {stepText}");
                    }
                    text.AppendLine();
                }
                Cell(html, $"background:{brand.Card};padding:14px 28px 22px;", inner.ToString());
                break;
            }
            case "proof":
            {
                var quote = Prop(block, "quote");
                var attribution = Prop(block, "attribution");
                var inner = new StringBuilder();
                inner.Append($"<div style=\"font-family:{BodyFont};font-size:14px;letter-spacing:3px;color:{brand.Accent};padding-bottom:10px;\">★★★★★</div>")
                    .Append($"<div style=\"font-family:{DisplayFont};font-style:italic;font-size:17px;line-height:1.5;color:{brand.Ink};\">&ldquo;{HtmlEncode(quote)}&rdquo;</div>");
                if (attribution.Length > 0)
                    inner.Append($"<div style=\"font-family:{BodyFont};font-size:13px;color:{brand.Muted};padding-top:10px;\">— {HtmlEncode(attribution)}</div>");
                Cell(html, $"background:{brand.Bg};padding:28px;text-align:center;", inner.ToString());
                text.AppendLine($"\"{quote}\" — {attribution}").AppendLine();
                break;
            }
            case "card":
            {
                var title = Prop(block, "title");
                var body = Prop(block, "body");
                var imageUrl = Prop(block, "imageUrl");
                var inner = new StringBuilder();
                if (imageUrl.Length > 0)
                    inner.Append($"<img src=\"{HtmlEncode(imageUrl)}\" alt=\"{HtmlEncode(title)}\" width=\"544\" style=\"display:block;width:100%;height:auto;border-radius:10px 10px 0 0;\">");
                inner.Append($"<div style=\"padding:18px 22px 22px;\"><div style=\"font-family:{DisplayFont};font-size:19px;color:{brand.Ink};padding-bottom:8px;\">{HtmlEncode(title)}</div>")
                    .Append($"<div style=\"font-family:{BodyFont};font-size:14px;line-height:1.55;color:{brand.Ink};\">{HtmlEncode(body).Replace("\n", "<br>")}</div>");
                AppendCta(inner, block, brand, padTop: 14);
                inner.Append("</div>");
                Cell(html, $"background:{brand.Card};padding:10px 28px;",
                    $"<div style=\"border:1px solid {brand.Bg};border-radius:10px;overflow:hidden;\">{inner}</div>");
                text.AppendLine(title.ToUpperInvariant()).AppendLine(body);
                AppendCtaText(text, block);
                text.AppendLine();
                break;
            }
            case "bullets":
            {
                var title = Prop(block, "title");
                var inner = new StringBuilder();
                if (title.Length > 0)
                    inner.Append($"<div style=\"font-family:{DisplayFont};font-size:20px;color:{brand.Ink};padding-bottom:10px;\">{HtmlEncode(title)}</div>");
                if (block.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    if (title.Length > 0) text.AppendLine(title.ToUpperInvariant());
                    foreach (var item in items.EnumerateArray())
                    {
                        var itemText = item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : "";
                        if (itemText.Length == 0) continue;
                        inner.Append($"<div style=\"font-family:{BodyFont};font-size:14px;line-height:1.7;color:{brand.Ink};\"><span style=\"color:{brand.Accent};\">&bull;</span>&nbsp; {HtmlEncode(itemText)}</div>");
                        text.AppendLine($"* {itemText}");
                    }
                }
                AppendCta(inner, block, brand, padTop: 16);
                AppendCtaText(text, block);
                Cell(html, $"background:{brand.Card};padding:14px 28px 24px;", inner.ToString());
                text.AppendLine();
                break;
            }
        }
    }

    private static void AppendCta(StringBuilder inner, JsonElement block, EmailBrand brand, int padTop)
    {
        var ctaText = Prop(block, "ctaText");
        var ctaUrl = Prop(block, "ctaUrl");
        if (ctaText.Length == 0 || ctaUrl.Length == 0) return;
        inner.Append($"<div style=\"padding-top:{padTop}px;\"><a href=\"{HtmlEncode(ctaUrl)}\" ")
            .Append($"style=\"display:inline-block;background:{brand.Accent};color:#ffffff;font-family:{BodyFont};font-size:14px;font-weight:bold;text-decoration:none;padding:13px 34px;border-radius:26px;\">")
            .Append(HtmlEncode(ctaText)).Append("</a></div>");
    }

    private static void AppendCtaText(StringBuilder text, JsonElement block)
    {
        var ctaText = Prop(block, "ctaText");
        var ctaUrl = Prop(block, "ctaUrl");
        if (ctaText.Length > 0 && ctaUrl.Length > 0) text.AppendLine($"{ctaText}: {ctaUrl}");
    }

    /// <summary>Compliance footer — always present, never a block the user can remove.</summary>
    private static void RenderFooter(
        StringBuilder html, StringBuilder text, EmailBrand brand, string identityName, string? physicalAddress)
    {
        var identity = identityName + (physicalAddress is { Length: > 0 } ? $" · {physicalAddress}" : "");
        Cell(html, $"background:{brand.Bg};padding:26px 28px;text-align:center;",
            $"<div style=\"font-family:{BodyFont};font-size:12px;line-height:1.7;color:{brand.Muted};\">{HtmlEncode(identity)}<br>" +
            $"No longer want these emails? <a href=\"{UnsubscribePlaceholder}\" style=\"color:{brand.Muted};text-decoration:underline;\">Unsubscribe</a> in one click, " +
            "or just reply &ldquo;unsubscribe&rdquo;.</div>");
        text.AppendLine("—").AppendLine(identity)
            .AppendLine($"No longer want these emails? Unsubscribe: {UnsubscribePlaceholder} (or reply \"unsubscribe\")");
    }

    private static void Cell(StringBuilder html, string style, string inner) =>
        html.Append("<tr><td style=\"").Append(style).Append("\">").Append(inner).Append("</td></tr>");
}
