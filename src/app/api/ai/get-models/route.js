import { NextResponse } from "next/server";

import { requiredEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${requiredEnv("OPENROUTER_API_KEY")}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API Error: ${response.status}`)
        }

        const data = await response.json();

        const freeModels = data.data.filter(model => {
            const promptPrice = parseFloat(model.pricing?.prompt || '0')
            const completionPrice = parseFloat(model.pricing?.completion || '0')

            return promptPrice === 0 && completionPrice === 0
        })

        const formatProviderName = (model) => {
            const providerId = model.id?.split("/")[0] || "unknown";
            const providerFromName = model.name?.split(":")[0]?.trim();

            if (providerFromName) return providerFromName;

            return providerId
                .split(/[-_]/)
                .filter(Boolean)
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ");
        };

        const formattedModels = freeModels.map(model => ({
            id: model.id,
            canonical_slug: model.canonical_slug ?? model.id,
            name: model.name ?? model.id,
            description: model.description ?? "No description available.",
            context_length: model.context_length ?? 0,
            architecture: {
                modality: model.architecture?.modality ?? "unknown",
                input_modalities: model.architecture?.input_modalities ?? [],
                output_modalities: model.architecture?.output_modalities ?? [],
                tokenizer: model.architecture?.tokenizer ?? "Unknown",
            },
            pricing: {
                prompt: model.pricing?.prompt ?? "0",
                completion: model.pricing?.completion ?? "0",
                request: model.pricing?.request ?? "0",
                image: model.pricing?.image ?? "0",
                web_search: model.pricing?.web_search ?? "0",
                input_cache_read: model.pricing?.input_cache_read ?? "0",
                input_cache_write: model.pricing?.input_cache_write ?? "0",
            },
            provider: {
                id: model.id?.split("/")[0] ?? "unknown",
                name: formatProviderName(model),
            },
            top_provider: {
                context_length: model.top_provider?.context_length ?? model.context_length ?? 0,
                max_completion_tokens: model.top_provider?.max_completion_tokens ?? 0,
                is_moderated: Boolean(model.top_provider?.is_moderated),
            }
        }))

        return NextResponse.json({
            models: formattedModels,
        })
    } catch (error) {
        console.error('Error fetching free models:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch free models',
            },
            {
                status: 500
            }
        );
    }
}
