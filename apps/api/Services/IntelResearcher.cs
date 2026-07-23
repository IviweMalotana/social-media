using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace SocialMedia.Api.Services;

public record IntelResearchResult(string BriefJson, string SourcesJson, string Model);

public record DiscoveredVertical(
    string Name, string Category, string Evidence, string WhyFit,
    string SuggestedFormats, string? Source);

/// <summary>
/// Buyer-vertical research grounded in REAL web search — Claude runs the
/// web_search server tool, reads what founders in the vertical actually say,
/// what ads and brands are working, and returns a structured brief with the
/// sources for every claim. Anything the search results don't support must be
/// labeled a hypothesis, never presented as fact. Same honesty rails as the
/// rest of the app: no invented reviews, statistics, or trends.
/// </summary>
public sealed class IntelResearcher
{
    private readonly AnthropicClient? _client;
    private readonly string _model;

    public IntelResearcher(IConfiguration config)
    {
        var apiKey = config["Anthropic:ApiKey"];
        _client = string.IsNullOrEmpty(apiKey) ? null : new AnthropicClient { ApiKey = apiKey };
        _model = config["Anthropic:Model"] is { Length: > 0 } model ? model : "claude-opus-4-8";
    }

    public bool IsConfigured => _client is not null;

    /// <summary>
    /// Researches one vertical. Runs the server-side web search loop (handling
    /// pause_turn continuations) and returns the structured brief + sources.
    /// </summary>
    public async Task<IntelResearchResult> ResearchAsync(
        string verticalName, string category, string ownerNotes, CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var userPrompt = $$"""
            Research this buyer vertical for Be Different Packaging (BDP), a cosmetic
            packaging supplier (bedifferentpackaging.com, Cape Town, South Africa).

            Vertical: {{verticalName}}
            Category: {{category}}
            Owner notes (trusted facts you may use): {{(string.IsNullOrWhiteSpace(ownerNotes) ? "(none)" : ownerNotes)}}

            Established BDP facts you may always use: orders start at 10 units; live
            tiered pricing on the site (no quote requests); tracked delivery in 5 to 14
            business days; custom silk screen / hot stamp branding from 2,500 units with
            4 to 6 week lead times; 4.9 star Etsy seller history; range covers bottles,
            jars, droppers, pumps, sprayers, roll-ons.

            Use web search to learn, from REAL current sources:
            1. How people in this vertical describe THEMSELVES (forums, their own sites,
               Reddit, TikTok/Instagram captions quoted in articles). What labels they
               use and which labels would feel condescending.
            2. Their top struggles when starting and growing (MOQs, formulation,
               packaging sourcing, cash flow, differentiation, regulations).
            3. What they want and what triggers a purchase from a supplier.
            4. Which content and ad angles are working on TikTok/Instagram for brands
               selling TO this audience or FOR brands in this vertical (hooks, formats,
               themes described in marketing writeups, case studies, platform reports).
            5. Which brands in this vertical are popping right now and what they're
               doing well that BDP's customers could learn from.
            6. How BDP should speak to them: formats to lead with, the education angle
               (e.g. unit economics of selling sets), and a first-line opener for a cold
               email that reflects their actual language.

            HONESTY RULES (non-negotiable):
            - Every claim must trace to a source you actually found in search. Attach
              the source URL to the item. If you could not verify something but believe
              it from general knowledge, set its source to null and prefix the text
              with "[hypothesis] ".
            - Never invent statistics, quotes, brand results, or trends.
            - Never call the buyers "indie", "small business", "hobbyist", or
              "entrepreneur" in suggested copy — use founder / brand / launch / run.

            OUTPUT: respond with ONLY one JSON object, no markdown fences, matching:
            {
              "identity": {"selfLabels": ["..."], "avoidLabels": ["..."], "voiceNotes": "how to talk to them"},
              "struggles": [{"pain": "...", "detail": "...", "source": "url or null"}],
              "desires": [{"want": "...", "detail": "...", "source": "url or null"}],
              "objections": [{"objection": "...", "answer": "how BDP answers it honestly", "source": "url or null"}],
              "contentAngles": [{"angle": "...", "why": "...", "example": "one concrete hook line", "source": "url or null"}],
              "adPatterns": [{"pattern": "...", "detail": "...", "source": "url or null"}],
              "poppingBrands": [{"brand": "...", "whatTheyDo": "...", "lessonForCustomers": "...", "source": "url or null"}],
              "bdpPlay": {"formats": ["..."], "hook": "...", "educationAngle": "...", "outreachOpener": "..."},
              "sources": [{"title": "...", "url": "..."}]
            }
            Aim for 3-6 items per list. Quality over quantity — a sourced claim beats
            three unsourced ones.
            """;

        var messages = new List<MessageParam>
        {
            new() { Role = Role.User, Content = userPrompt },
        };

        Message response;
        var continuations = 0;
        while (true)
        {
            response = await _client.Messages.Create(new MessageCreateParams
            {
                Model = _model,
                MaxTokens = 16000,
                Thinking = new ThinkingConfigAdaptive(),
                System = "You are a market researcher for a packaging supplier. You research " +
                         "buyer psychology using web search and report only what the sources " +
                         "support. You are truthful above all.",
                Tools = [new ToolUnion(new WebSearchTool20260209 { MaxUses = 12 })],
                Messages = [.. messages],
            }, cancellationToken: ct);

            // Server-side tool loop can pause; resume by echoing the turn back.
            if (response.StopReason?.ToString() == "pause_turn" && continuations < 6)
            {
                continuations++;
                messages.Add(new MessageParam
                {
                    Role = Role.Assistant,
                    Content = ToParamContent(response),
                });
                continue;
            }
            break;
        }

        var text = string.Concat(response.Content
            .Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var briefJson = ExtractJson(text);

        // Sources live inside the brief; mirror them to their own column so the
        // list view can show receipts without parsing the whole brief.
        var sourcesJson = "[]";
        try
        {
            using var doc = JsonDocument.Parse(briefJson);
            if (doc.RootElement.TryGetProperty("sources", out var sources))
                sourcesJson = sources.GetRawText();
        }
        catch (JsonException) { /* brief failed validation below anyway */ }

        // Validate the brief parses; a malformed response should fail loudly, not
        // save garbage the UI chokes on.
        using (JsonDocument.Parse(briefJson)) { }

        return new IntelResearchResult(briefJson, sourcesJson, _model);
    }

    /// <summary>
    /// Digs for buyer micro-verticals NOT already on the list — the whole point
    /// is finding buyers nobody thought of. Searches real sources (who buys
    /// small-batch bottles/droppers/roll-ons, low-MOQ packaging complaints,
    /// trend writeups, marketplace categories) and proposes candidates with
    /// evidence. Candidates land as suggestions a human approves or dismisses;
    /// nothing is auto-briefed.
    /// </summary>
    public async Task<List<DiscoveredVertical>> DiscoverAsync(
        IReadOnlyList<string> existingNames, CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var userPrompt = $$"""
            You are hunting for NEW buyer micro-verticals for Be Different Packaging
            (BDP), a cosmetic packaging supplier in Cape Town, South Africa selling
            glass/plastic bottles, jars, droppers, pumps, sprayers, roll-ons and
            atomizers from a 10-unit minimum with live tiered pricing and tracked
            worldwide delivery. Custom branding from 2,500 units.

            We already track these verticals — do NOT propose these or trivial
            rewordings of them:
            {{string.Join("\n", existingNames.Select(n => "- " + n))}}

            Use web search to DIG for buyer types we have NOT thought of. Think past
            the obvious beauty categories. Hunt in places like:
            - who is searching for or complaining about small-quantity bottle/dropper/
              roll-on/spray packaging (forums, Reddit, maker communities)
            - trend writeups on new product categories that need this packaging
              (wellness shots, hair oiling, scent layering, home apothecary, DIY kits)
            - marketplace seller categories (Etsy, Faire, Takealot) whose products
              ship in these formats
            - professions and businesses that hand out or resell liquids in small
              formats (therapists, coaches, event planners, educators, clinics)
            - South African and US niches specifically underserved on low MOQs

            For each candidate, verify with search that real people in that niche
            actually buy or struggle to buy this kind of packaging — the evidence
            field must describe what you actually found, with the URL.

            HONESTY RULES:
            - Only propose verticals you found real evidence for. No inventions.
            - evidence must summarize a real source; source carries its URL.
            - If a candidate is a logical guess without direct evidence, prefix
              evidence with "[hypothesis] " and set source to null.

            OUTPUT: respond with ONLY one JSON object, no markdown fences:
            {
              "candidates": [
                {
                  "name": "Founders starting a [X] brand — phrased how WE describe the buyer",
                  "category": "one of: Beauty & Personal Care, Fragrance, Health & Wellness, Hospitality, Spa & Aesthetic, Medical / Practitioner, Hair care, Food & Beverage, Home & Cleaning, Pet & Animal, Sport & Outdoor, Gifting & Events, Religious / Ceremonial, Retail & Private Label, Other",
                  "evidence": "what you found showing this buyer type exists and needs this packaging",
                  "whyFit": "why BDP's 10-unit MOQ / formats are an unlock for them",
                  "suggestedFormats": "e.g. 10ml roll-ons, amber droppers",
                  "source": "url or null"
                }
              ]
            }
            Propose 4 to 8 candidates, best evidence first. Distinct niches only —
            no two candidates that are really the same buyer.
            """;

        var messages = new List<MessageParam>
        {
            new() { Role = Role.User, Content = userPrompt },
        };

        Message response;
        var continuations = 0;
        while (true)
        {
            response = await _client.Messages.Create(new MessageCreateParams
            {
                Model = _model,
                MaxTokens = 16000,
                Thinking = new ThinkingConfigAdaptive(),
                System = "You are a market researcher hunting for underserved buyer niches. " +
                         "You verify every candidate against real web sources and never invent " +
                         "evidence. You are truthful above all.",
                Tools = [new ToolUnion(new WebSearchTool20260209 { MaxUses = 15 })],
                Messages = [.. messages],
            }, cancellationToken: ct);

            if (response.StopReason?.ToString() == "pause_turn" && continuations < 6)
            {
                continuations++;
                messages.Add(new MessageParam
                {
                    Role = Role.Assistant,
                    Content = ToParamContent(response),
                });
                continue;
            }
            break;
        }

        var text = string.Concat(response.Content
            .Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        var json = ExtractJson(text);

        var results = new List<DiscoveredVertical>();
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("candidates", out var candidates))
            return results;
        foreach (var c in candidates.EnumerateArray())
        {
            var name = GetString(c, "name");
            if (name.Length == 0) continue;
            results.Add(new DiscoveredVertical(
                name,
                GetString(c, "category"),
                GetString(c, "evidence"),
                GetString(c, "whyFit"),
                GetString(c, "suggestedFormats"),
                c.TryGetProperty("source", out var s) && s.ValueKind == JsonValueKind.String
                    ? s.GetString() : null));
        }
        return results;
    }

    private static string GetString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? "" : "";

    /// <summary>
    /// Rebuilds response content as params for the pause_turn continuation. Text
    /// and thinking blocks echo back; server tool blocks are represented by their
    /// serialized form via the SDK's union types.
    /// </summary>
    private static List<ContentBlockParam> ToParamContent(Message response)
    {
        var blocks = new List<ContentBlockParam>();
        foreach (var block in response.Content)
        {
            if (block.TryPickText(out TextBlock? text))
                blocks.Add(new TextBlockParam { Text = text.Text });
            else if (block.TryPickThinking(out ThinkingBlock? thinking))
                blocks.Add(new ThinkingBlockParam
                {
                    Thinking = thinking.Thinking,
                    Signature = thinking.Signature,
                });
        }
        return blocks;
    }

    /// <summary>
    /// Pulls the JSON object out of the model's final text. Tolerates markdown
    /// fences and prose around the object; throws if no JSON object is present.
    /// </summary>
    internal static string ExtractJson(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
            throw new InvalidOperationException("Research response contained no JSON object.");
        return text[start..(end + 1)];
    }
}
