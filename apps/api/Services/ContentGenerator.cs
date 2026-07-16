using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Services;

public record GeneratedVariant(string Platform, string Caption, List<string> Hashtags);

public record PersonalizedEmail(string Subject, string Body);

public record GeneratedArticle(string Title, string Slug, string MetaDescription, string BodyMarkdown);

/// <summary>
/// AI caption generation via the Claude API. Configured with Anthropic:ApiKey
/// (Railway: Anthropic__ApiKey); model defaults to claude-opus-4-8 and can be
/// overridden with Anthropic:Model. Uses structured outputs so the response is
/// guaranteed-parseable JSON — no brittle text scraping.
/// </summary>
public sealed class ContentGenerator
{
    private readonly AnthropicClient? _client;
    private readonly string _model;

    public ContentGenerator(IConfiguration config)
    {
        var apiKey = config["Anthropic:ApiKey"];
        _client = string.IsNullOrEmpty(apiKey) ? null : new AnthropicClient { ApiKey = apiKey };
        _model = config["Anthropic:Model"] is { Length: > 0 } model ? model : "claude-opus-4-8";
    }

    public bool IsConfigured => _client is not null;

    public async Task<List<GeneratedVariant>> GenerateAsync(
        string topic,
        string tone,
        IReadOnlyList<Domain.Platform> platforms,
        int variantsPerPlatform,
        CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var platformNotes = string.Join("\n", platforms.Select(p =>
        {
            var spec = PlatformCatalog.Specs[p];
            return $"- {spec.Platform}: max {spec.MaxCaptionLength} characters." + p switch
            {
                Domain.Platform.Instagram => " Engaging first line (feed truncates early), emojis welcome, 3-8 hashtags.",
                Domain.Platform.Facebook => " Conversational, minimal hashtags (0-2), a question or CTA performs well.",
                Domain.Platform.TikTok => " Short punchy hook, native/informal voice, 3-5 hashtags.",
                Domain.Platform.Pinterest => " Searchable keyword-rich description; first line may be a destination URL if provided.",
                Domain.Platform.WhatsApp => " Direct message to an opted-in customer; personal tone, one clear CTA, no hashtags.",
                _ => "",
            };
        }));

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 4096,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You are an expert social media copywriter for small businesses. " +
                     "You write captions that sound human and native to each platform — never generic marketing sludge. " +
                     "Respect every platform's character limit strictly.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Write {variantsPerPlatform} caption variant(s) for each platform below.

                        Topic / what we're posting about: {topic}
                        Tone: {tone}

                        Platforms and their rules:
                        {platformNotes}

                        Each variant must fit its platform's limit including hashtags. Hashtags go in
                        the hashtags array without the # symbol, not in the caption text.
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            variants = new
                            {
                                type = "array",
                                items = new
                                {
                                    type = "object",
                                    properties = new
                                    {
                                        platform = new { type = "string" },
                                        caption = new { type = "string" },
                                        hashtags = new { type = "array", items = new { type = "string" } },
                                    },
                                    required = new[] { "platform", "caption", "hashtags" },
                                    additionalProperties = false,
                                },
                            },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(new[] { "variants" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);

        var variants = new List<GeneratedVariant>();
        foreach (var item in doc.RootElement.GetProperty("variants").EnumerateArray())
        {
            variants.Add(new GeneratedVariant(
                item.GetProperty("platform").GetString() ?? "",
                item.GetProperty("caption").GetString() ?? "",
                [.. item.GetProperty("hashtags").EnumerateArray().Select(h => h.GetString() ?? "")]));
        }
        return variants;
    }

    /// <summary>
    /// Polishes one merged outreach draft: fills [bracketed personalization] spots
    /// using ONLY the facts we hold on the prospect — never invented specifics. If the
    /// facts aren't enough, the bracket stays and the send guard keeps a human in the
    /// loop. Everything lands in the review queue regardless.
    /// </summary>
    public async Task<PersonalizedEmail> PersonalizeEmailAsync(
        string subject, string body,
        string companyName, string contactName, string segment, string city, string country,
        string? notes, CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 2048,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You polish cold outreach emails for a small South African packaging supplier. " +
                     "You are truthful above all: you never invent facts, reviews, awards, product names, " +
                     "or anything not present in the provided prospect facts.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Below is one outreach email draft. Your only job:

                        1. If it contains a [bracketed placeholder], replace it with one genuine,
                           specific-feeling line built ONLY from the prospect facts given. If the
                           facts are too thin to write something honest, replace it with a
                           SHORTER bracketed note telling the human reviewer what to add,
                           e.g. "[add one line about their property]".
                        2. Leave everything else essentially unchanged — same offer, same
                           structure, same sign-off, same length. Do not add new claims.

                        Prospect facts (the ONLY facts you may use):
                        - Company: {companyName}
                        - Contact: {(string.IsNullOrWhiteSpace(contactName) ? "(unknown)" : contactName)}
                        - Segment: {segment}
                        - City: {(string.IsNullOrWhiteSpace(city) ? "(unknown)" : city)}
                        - Market: {country}
                        - Research notes: {(string.IsNullOrWhiteSpace(notes) ? "(none)" : notes)}

                        Subject: {subject}

                        Body:
                        {body}
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            subject = new { type = "string" },
                            body = new { type = "string" },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(new[] { "subject", "body" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);
        return new PersonalizedEmail(
            doc.RootElement.GetProperty("subject").GetString() ?? subject,
            doc.RootElement.GetProperty("body").GetString() ?? body);
    }

    /// <summary>
    /// Drafts a long-form SEO article for the shop's blog. Structure is fixed
    /// (keyworded title, intro hook, H2 sections, FAQ, CTA); facts come only from
    /// the brief — anything unknown becomes a [bracketed placeholder] for the human
    /// editor, never an invented number.
    /// </summary>
    public async Task<GeneratedArticle> GenerateArticleAsync(
        string topic, string keyword, string audience, string? notes, CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 8192,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You write practical, genuinely useful blog articles for Be Different Packaging " +
                     "(bedifferentpackaging.com) — a South African cosmetic-packaging supplier. " +
                     "Established facts you may always use: orders start at 10 units; live tiered " +
                     "pricing on the site (unit price drops as quantity rises, no quote requests); " +
                     "custom silk-screen/hot-stamp branding from 2,500 units with 4-6 week factory-direct " +
                     "lead times; 4.9-star seller history from their Etsy years; product range covers " +
                     "bottles, jars, droppers and pumps for skincare/cosmetics. " +
                     "You are truthful above all: never invent statistics, prices, studies, customer " +
                     "stories, or claims. Where a specific fact is needed but not provided, write a " +
                     "[bracketed placeholder describing what the human should insert]. " +
                     "Voice: founder-adjacent, plain, expert — like a supplier who actually packs boxes, " +
                     "not a content farm.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Write one SEO blog article.

                        Topic: {topic}
                        Primary keyword (use naturally in title, first paragraph, one H2, and meta description): {keyword}
                        Written for: {audience}
                        Extra facts/notes from the owner (usable as facts): {(string.IsNullOrWhiteSpace(notes) ? "(none)" : notes)}

                        Structure (fixed):
                        - Title: compelling, contains the keyword, no clickbait
                        - Intro: 2-3 sentences hooking the reader's actual problem
                        - 4-6 H2 sections (## in markdown) with practical, specific guidance;
                          use short paragraphs and bullet lists where they help
                        - One H2 must be an FAQ with exactly 3 questions (### per question)
                        - Closing section with a natural call to action to browse
                          bedifferentpackaging.com (mention from-10-units or live pricing where honest)
                        - 900-1400 words. Body in clean markdown, no H1 (the title is the H1).

                        Also produce:
                        - slug: kebab-case, short, keyword-bearing
                        - metaDescription: max 155 characters, contains the keyword, sells the click honestly
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            title = new { type = "string" },
                            slug = new { type = "string" },
                            metaDescription = new { type = "string" },
                            bodyMarkdown = new { type = "string" },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(
                            new[] { "title", "slug", "metaDescription", "bodyMarkdown" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);
        return new GeneratedArticle(
            doc.RootElement.GetProperty("title").GetString() ?? topic,
            doc.RootElement.GetProperty("slug").GetString() ?? "",
            doc.RootElement.GetProperty("metaDescription").GetString() ?? "",
            doc.RootElement.GetProperty("bodyMarkdown").GetString() ?? "");
    }
}
