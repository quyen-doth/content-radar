import type Anthropic from "@anthropic-ai/sdk";

export type ToolHandler = (input: Record<string, unknown>) => unknown;

export interface RegisteredTool {
  definition: Anthropic.Tool;
  handler: ToolHandler;
}

const registry = new Map<string, RegisteredTool>();

export function registerTool(def: Anthropic.Tool, handler: ToolHandler): void {
  registry.set(def.name, { definition: def, handler });
}

export function getToolDefinitions(): Anthropic.Tool[] {
  return [...registry.values()].map((t) => t.definition);
}

export function handleToolCall(name: string, input: Record<string, unknown>): unknown {
  const tool = registry.get(name);
  if (!tool) throw new Error(`Tool "${name}" không có trong registry`);
  return tool.handler(input);
}

export function clearRegistry(): void {
  registry.clear();
}
