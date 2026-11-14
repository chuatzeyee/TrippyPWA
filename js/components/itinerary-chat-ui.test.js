import { describe, it, expect } from 'vitest';
import { chatExamples, chatEmptyHtml, CHAT_GREETING } from './itinerary-chat-ui.js';

describe('chatExamples', () => {
  it('suggests three edits on days the trip has', () => {
    expect(chatExamples(14)).toEqual([
      'Make day 2 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 3',
    ]);
  });

  it('never points at a day past the end of a short trip', () => {
    expect(chatExamples(2)).toEqual([
      'Make day 2 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 2',
    ]);
    expect(chatExamples(1)).toEqual([
      'Make day 1 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 1',
    ]);
    expect(chatExamples(0)[0]).toBe('Make day 1 more relaxed');
    expect(chatExamples(undefined)[2]).toBe('Add a coffee stop on day 1');
  });
});

describe('chatEmptyHtml', () => {
  it('greets and offers each example as a tappable button', () => {
    const html = chatEmptyHtml(chatExamples(5));
    expect(CHAT_GREETING).toBe('Ask for a change and I\'ll suggest edits you can apply.');
    expect(html).toContain('<p class="td-chat-empty-text">Ask for a change and I&#39;ll suggest edits you can apply.</p>');
    expect(html.match(/<button type="button" class="td-chat-example">/g)).toHaveLength(3);
    expect(html).toContain('>Swap a museum for a park</button>');
  });

  it('escapes example text', () => {
    expect(chatEmptyHtml(['<b>"x"</b>'])).toContain('>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</button>');
  });

  it('keeps the copy free of dashes, middle dots and bullets', () => {
    expect(chatEmptyHtml(chatExamples(9))).not.toMatch(/[–—·•]/);
  });
});
