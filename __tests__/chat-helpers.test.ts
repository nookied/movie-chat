/**
 * Unit tests for lib/chatPrompts.ts:
 *   - isGemmaModel()  — string-sniffs model names for gemma variants
 *   - getSystemPrompt() — picks Gemma prompt vs default based on model
 *
 * The chat POST handler itself (streaming, rate limit, provider selection)
 * is covered in chat-route.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  isGemmaModel,
  getSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  GEMMA_SYSTEM_PROMPT,
} from '@/lib/chatPrompts';

describe('isGemmaModel', () => {
  it('matches Ollama-style gemma tags', () => {
    expect(isGemmaModel('gemma4:e2b')).toBe(true);
    expect(isGemmaModel('gemma3n:e2b')).toBe(true);
    expect(isGemmaModel('gemma:2b')).toBe(true);
  });

  it('matches OpenRouter-style gemma slugs', () => {
    expect(isGemmaModel('google/gemma-4-e2b')).toBe(true);
    expect(isGemmaModel('google/gemma-3n-E4B-it')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isGemmaModel('GEMMA4:E2B')).toBe(true);
    expect(isGemmaModel('Gemma-4-IT')).toBe(true);
  });

  it('does not match non-Gemma models', () => {
    expect(isGemmaModel('mistralai/mistral-small-3.1-24b-instruct:free')).toBe(false);
    expect(isGemmaModel('meta-llama/llama-3.2-3b-instruct')).toBe(false);
    expect(isGemmaModel('qwen2.5:7b')).toBe(false);
    expect(isGemmaModel('')).toBe(false);
  });
});

describe('getSystemPrompt', () => {
  it('returns the Gemma prompt for Gemma models', () => {
    expect(getSystemPrompt('gemma4:e2b')).toBe(GEMMA_SYSTEM_PROMPT);
    expect(getSystemPrompt('google/gemma-4-e2b')).toBe(GEMMA_SYSTEM_PROMPT);
  });

  it('returns the default prompt for non-Gemma models', () => {
    expect(getSystemPrompt('mistralai/mistral-small-3.1-24b-instruct:free')).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(getSystemPrompt('llama3.2:3b')).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('returns the default prompt for empty model names', () => {
    // Shouldn't happen in practice, but defensive behaviour matters if cfg() ever returns ''
    expect(getSystemPrompt('')).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});

describe('system prompt content invariants', () => {
  it('both prompts require a <recommendation> tag per title', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/<recommendation>/);
    expect(GEMMA_SYSTEM_PROMPT).toMatch(/<recommendation>/);
  });

  it('both prompts scope the assistant to movies and TV only', () => {
    expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain('movie');
    expect(GEMMA_SYSTEM_PROMPT.toLowerCase()).toContain('movie');
  });

  it('both prompts gate the download tag on [System] + user confirmation', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/<download>/);
    expect(GEMMA_SYSTEM_PROMPT).toMatch(/<download>/);
    expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain('[system]');
    expect(GEMMA_SYSTEM_PROMPT.toLowerCase()).toContain('[system]');
  });

  it('Gemma prompt is shorter or comparable to the default (tight prompt goal)', () => {
    // The Gemma prompt is tuned to be more direct; not a hard cap but a
    // sanity check that it doesn't accidentally balloon past the default.
    expect(GEMMA_SYSTEM_PROMPT.length).toBeLessThanOrEqual(DEFAULT_SYSTEM_PROMPT.length * 1.15);
  });
});
