interface FeedItem {
  id?: string;
  uuid?: string;
  title?: string;
  titleEn?: string;
  content?: string;
  author?: { department?: string };
  publishedDate?: string;
  createdAt?: string;
  url?: string;
  fileUrl?: string;
  attachments?: unknown[];
}

interface FeedMessage {
  source?: string;
  items?: FeedItem[];
  filter?: string;
  theme?: string;
}

function getFeedContainer(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.feed');
  if (!element) throw new Error('Missing feed frame container');
  return element;
}

const feed = getFeedContainer();

function escapeHTML(value: string = ''): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function reportHeight(): void {
        requestAnimationFrame(() => parent.postMessage({
          source: 'nepal-feed-frame',
          type: 'height',
          height: Math.ceil(feed.getBoundingClientRect().bottom + 2),
        }, location.origin));
      }

function cardMarkup(item: FeedItem, index: number, filter: string, key: string): string {
        const title = escapeHTML(item.title || item.titleEn || 'Untitled update');
        const content = item.content && item.content !== item.title ? String(item.content) : '';
        const department = escapeHTML(item.author?.department || (filter === 'loksewa' ? 'Public Service Commission' : filter === 'tender' ? 'Public Procurement' : 'Government of Nepal'));
        const date = new Date(item.publishedDate || item.createdAt || '');
        const formattedDate = Number.isNaN(date.getTime()) ? 'Recently posted' : new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
        const contentMarkup = content ? `<p class="card-content">${escapeHTML(content)}</p>${content.length > 160 ? '<button class="read-more" type="button" aria-expanded="false">Read more</button>' : ''}` : '';
        const link = item.url || (filter === 'loksewa' && item.fileUrl ? item.fileUrl : `https://nepal.gov.np/updates/${encodeURIComponent(item.id || '')}`);
        const attachments = item.attachments?.length ? `<span class="attachment-count">${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}</span>` : '';
        return `<article class="update-card" data-feed-id="${escapeHTML(key)}"><div class="card-number">${String(index + 1).padStart(2, '0')}</div><div class="card-body"><div class="card-date"><span class="status-dot"></span>${escapeHTML(formattedDate)}</div><h3>${title}</h3>${contentMarkup}<div class="card-footer"><span class="department">${department}</span>${attachments}</div></div><a class="card-open" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open official update">↗</a></article>`;
      }

function renderCards(items: FeedItem[], filter: string, theme: string): void {
        const palette = theme === 'dark'
          ? { bg: '#101419', surface: '#181e25', ink: '#eef2f6', muted: '#b4bec9', border: '#303944', green: '#83dbad', chip: '#202831' }
          : { bg: '#f7f8fa', surface: '#fff', ink: '#17212b', muted: '#596574', border: '#e1e5ea', green: '#176b4a', chip: '#f1f4f6' };
        document.documentElement.style.colorScheme = theme;
        for (const [key, value] of Object.entries(palette)) document.documentElement.style.setProperty(`--${key === 'bg' ? 'page-bg' : key}`, value);
        const existing = new Map(Array.from(feed.children, (card) => [
          (card as HTMLElement).dataset.feedId ?? '', card as HTMLElement,
        ]));
        items.forEach((item, index) => {
          const key = String(item.id || item.uuid || `${item.title || item.titleEn || 'update'}-${index}`);
          let card = existing.get(key);
          if (card) {
            existing.delete(key);
          } else {
            const template = document.createElement('template');
            template.innerHTML = cardMarkup(item, index, filter, key);
            const newCard = template.content.firstElementChild;
            if (!(newCard instanceof HTMLElement)) return;
            card = newCard;
          }
          const number = card.querySelector<HTMLElement>('.card-number');
          if (number) number.textContent = String(index + 1).padStart(2, '0');
          const currentAtIndex = feed.children[index];
          if (currentAtIndex !== card) feed.insertBefore(card, currentAtIndex || null);
        });
        existing.forEach((card) => card.remove());
        resizeObserver.observe(document.body);
        reportHeight();
      }

document.addEventListener('click', (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest<HTMLButtonElement>('.read-more');
        if (!button) return;
        const content = button.previousElementSibling;
        if (!content) return;
        const expanded = content.classList.toggle('expanded');
        button.setAttribute('aria-expanded', String(expanded));
        button.textContent = expanded ? 'Show less' : 'Read more';
        reportHeight();
      });

window.addEventListener('message', (event: MessageEvent<FeedMessage>) => {
        if (event.source !== parent || event.origin !== location.origin || event.data?.source !== 'nepal-feed-parent') return;
        renderCards(Array.isArray(event.data.items) ? event.data.items : [], event.data.filter || 'latest', event.data.theme || 'light');
      });
const resizeObserver = new ResizeObserver(reportHeight);
resizeObserver.observe(document.body);
