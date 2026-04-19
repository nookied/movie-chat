'use client';

import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { ChatMessage } from '@/types';
import { extractDownloadActions, extractRecommendations } from '@/lib/chatTags';
import { randomId } from '@/lib/randomId';

const FETCH_RETRY_DELAYS_MS = [500, 1000, 2000];
const WELCOME_MESSAGE_ID = 'welcome';

function createAbortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function waitForDelay(
  ms: number,
  signal: AbortSignal,
  timeoutIds: Set<ReturnType<typeof setTimeout>>
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      timeoutIds.delete(timeoutId);
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      clearTimeout(timeoutId);
      timeoutIds.delete(timeoutId);
      reject(createAbortError());
    }

    timeoutIds.add(timeoutId);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export function buildChatHistory(messages: ChatMessage[], userMessage: ChatMessage) {
  return [...messages, userMessage]
    .filter((message) => message.content && message.id !== WELCOME_MESSAGE_ID)
    .map((message) => ({
      role: message.role === 'info' ? 'assistant' : message.role,
      content: message.content,
    }));
}

export function shouldRetryRecommendationTag(content: string, recommendationCount: number): boolean {
  const trimmedContent = content.trim();
  return recommendationCount === 0
    && content.length > 50
    && !trimmedContent.endsWith('?')
    && !/^(what genre|what kind|what are you|to give you|to get you|i'm only set up)/i.test(trimmedContent);
}

async function readStreamBody(
  body: ReadableStream<Uint8Array>,
  onProgress?: (value: string) => void,
  initialValue = ''
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let fullContent = initialValue;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullContent += decoder.decode(value, { stream: true });
    onProgress?.(fullContent);
  }

  return fullContent;
}

async function requestChatOnce(
  body: object,
  onProgress?: (value: string) => void,
  initialValue = '',
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => 'Unknown error');
    let errMsg = errText;
    try { errMsg = JSON.parse(errText).error ?? errText; } catch { /* not JSON */ }
    throw Object.assign(new Error(errMsg), { isHttpError: true });
  }

  return readStreamBody(response.body, onProgress, initialValue);
}

async function requestChatWithRetry(
  body: object,
  onProgress: (value: string) => void,
  signal: AbortSignal,
  timeoutIds: Set<ReturnType<typeof setTimeout>>
): Promise<string> {
  let lastErr: Error = new Error('Request failed');

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    if (signal.aborted) throw createAbortError();
    if (attempt > 0) onProgress('');
    try {
      return await requestChatOnce(body, onProgress, '', signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if ((error as Error & { isHttpError?: boolean }).isHttpError) throw error;
      lastErr = error instanceof Error ? error : new Error(String(error));
      if (attempt < FETCH_RETRY_DELAYS_MS.length) {
        await waitForDelay(FETCH_RETRY_DELAYS_MS[attempt], signal, timeoutIds);
      }
    }
  }

  throw lastErr;
}

async function requestRecommendationRetry(
  history: Array<{ role: string; content: string }>,
  fullContent: string,
  signal: AbortSignal
): Promise<string | null> {
  const retryMessages = [
    ...history,
    { role: 'assistant', content: fullContent },
    { role: 'user', content: '[System] You mentioned a title without a <recommendation> tag. Emit the tag now.' },
  ];

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: retryMessages }),
    signal,
  });
  if (!response.ok || !response.body) return null;
  return response.text();
}

interface Options {
  isStreaming: boolean;
  messages: ChatMessage[];
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  triggerDownload: (title: string, year?: number) => Promise<boolean>;
}

export function useChatSendMessage({
  isStreaming,
  messages,
  setIsStreaming,
  setMessages,
  triggerDownload,
}: Options) {
  const controllersRef = useRef(new Set<AbortController>());
  const timeoutIdsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const isMountedRef = useRef(true);

  useEffect(() => () => {
    isMountedRef.current = false;
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current.clear();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || isStreaming) return;

    const controller = new AbortController();
    controllersRef.current.add(controller);
    const now = Date.now();
    const userMsg: ChatMessage = { id: randomId(), role: 'user', content: trimmedText, timestamp: now };
    const assistantMsg: ChatMessage = { id: randomId(), role: 'assistant', content: '', timestamp: now };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const history = buildChatHistory(messages, userMsg);
    const updateAssistantMessage = (content: string) => {
      if (!isMountedRef.current) return;
      setMessages((prev) =>
        prev.map((message) => (
          message.id === assistantMsg.id ? { ...message, content } : message
        ))
      );
    };

    try {
      let fullContent = await requestChatWithRetry(
        { messages: history },
        updateAssistantMessage,
        controller.signal,
        timeoutIdsRef.current
      );

      if (!fullContent.trim()) {
        fullContent = await requestChatOnce(
          { messages: history, forceOllama: true },
          updateAssistantMessage,
          '',
          controller.signal
        );
      }

      if (!fullContent.trim()) {
        throw new Error('No response received. Please try again.');
      }

      let recommendations = extractRecommendations(fullContent);
      if (shouldRetryRecommendationTag(fullContent, recommendations.length)) {
        try {
          const retryContent = await requestRecommendationRetry(history, fullContent, controller.signal);
          if (retryContent) recommendations = extractRecommendations(retryContent);
        } catch { /* retry is best-effort — don't block the main flow */ }
      }

      if (recommendations.length > 0 && isMountedRef.current) {
        setMessages((prev) =>
          prev.map((message) => (
            message.id === assistantMsg.id
              ? { ...message, content: fullContent, recommendations }
              : message
          ))
        );
      }

      const downloads = extractDownloadActions(fullContent);
      for (const download of downloads) {
        triggerDownload(download.title, download.year);
      }
    } catch (error) {
      if (isAbortError(error) || !isMountedRef.current) return;
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((message) => (
          message.id === assistantMsg.id
            ? { ...message, content: `Sorry, I ran into an error: ${errMsg}` }
            : message
        ))
      );
    } finally {
      controllersRef.current.delete(controller);
      if (isMountedRef.current) setIsStreaming(false);
    }
  }, [isStreaming, messages, setIsStreaming, setMessages, triggerDownload]);

  return { sendMessage };
}
