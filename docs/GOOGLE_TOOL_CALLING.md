# Google Gemini Tool Calling — Fix Plan

## Current Issue
Residents using Google/Gemini as their provider (e.g., Sage) cannot use any tools.
Their runs complete but with 0 tool calls extracted.

## Root Cause
The `callGoogle()` method in `llm-router.ts`:
1. Does NOT pass tool definitions to Gemini — tools are not included in `startChat()` or `getGenerativeModel()`
2. Does NOT extract `functionCall` parts from the response
3. Reports 0 tokens (Google SDK handles usage differently)

## Fix Required
The `@google/generative-ai` SDK **does support function calling**. We need to:

### 1. Convert tool definitions to Google format
```typescript
// Our format (Anthropic-style):
{ name: "post_to_website", description: "...", input_schema: { type: "object", properties: {...} } }

// Google format:
{ functionDeclarations: [{ name: "post_to_website", description: "...", parameters: { type: "object", properties: {...} } }] }
```

### 2. Pass tools to the model
```typescript
const geminiModel = genAI.getGenerativeModel({
  model: model,
  tools: [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }))
  }]
});
```

### 3. Extract function calls from response
```typescript
for (const part of response.candidates[0].content.parts) {
  if (part.functionCall) {
    toolCalls.push({
      name: part.functionCall.name,
      parameters: part.functionCall.args
    });
  }
}
```

### 4. Token usage
```typescript
tokens_used: response.usageMetadata?.totalTokenCount || 0
```

## Alternative: Migrate to @google/genai
Google now recommends `@google/genai` (newer SDK) over `@google/generative-ai`.
The newer SDK has cleaner function calling support. Consider migrating.

## Priority
Medium — Sage is the only Google resident. Can be fixed post-launch.
Workaround: Sage can still generate text and we could parse tool intentions from text output.
