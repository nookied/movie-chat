import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYSTEM_PROMPT,
  GEMMA_SYSTEM_PROMPT,
  getSystemPrompt,
  isGemmaModel,
} from '@/lib/chatPrompts';

describe('isGemmaModel', () => {
  it('matches gemma model names case-insensitively', () => {
    expect(isGemmaModel('gemma3:4b')).toBe(true);
    expect(isGemmaModel('gemma-3n-e4b-it')).toBe(true);
    expect(isGemmaModel('google/gemma-2-9b-it')).toBe(true);
    expect(isGemmaModel('Gemma3:latest')).toBe(true);
    expect(isGemmaModel('GEMMA-4')).toBe(true);
  });

  it('rejects non-gemma models', () => {
    expect(isGemmaModel('mistralai/mistral-small-3.1-24b-instruct:free')).toBe(false);
    expect(isGemmaModel('llama3.2:3b')).toBe(false);
    expect(isGemmaModel('qwen3:4b')).toBe(false);
    expect(isGemmaModel('deepseek-r1:8b')).toBe(false);
    expect(isGemmaModel('')).toBe(false);
  });
});

describe('getSystemPrompt', () => {
  it('returns Gemma prompt for Gemma models', () => {
    expect(getSystemPrompt('gemma3:4b')).toBe(GEMMA_SYSTEM_PROMPT);
    expect(getSystemPrompt('google/gemma-2-9b-it')).toBe(GEMMA_SYSTEM_PROMPT);
  });

  it('returns default prompt for non-Gemma models', () => {
    expect(getSystemPrompt('mistralai/mistral-small-3.1-24b-instruct:free')).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(getSystemPrompt('llama3.2:3b')).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('prompts contain the required recommendation tag format', () => {
    const tagPattern = '<recommendation>';
    expect(DEFAULT_SYSTEM_PROMPT).toContain(tagPattern);
    expect(GEMMA_SYSTEM_PROMPT).toContain(tagPattern);
  });

  it('prompts contain the download tag format', () => {
    const tagPattern = '<download>';
    expect(DEFAULT_SYSTEM_PROMPT).toContain(tagPattern);
    expect(GEMMA_SYSTEM_PROMPT).toContain(tagPattern);
  });

  it('Gemma prompt uses User:/You: dialogue format', () => {
    expect(GEMMA_SYSTEM_PROMPT).toMatch(/User:.*\nYou:/);
    // Default prompt does NOT use this format
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/\nYou:/);
  });
});
