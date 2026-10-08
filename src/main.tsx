import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowUp, ArrowUpRight, Clock3, Landmark, LoaderCircle, Moon, RefreshCw, Search, Sun, type LucideIcon } from 'lucide-react';
import './styles.css';

const FEED_URL = '/api/updates';
const SOURCE_URL = 'https://nepal.gov.np';

type FeedFilter = 'latest' | 'top' | 'tender' | 'loksewa' | 'ipo';
type FeedStatus = 'loading' | 'refreshing' | 'success' | 'error';
const FILTER_TABS: ReadonlyArray<readonly [FeedFilter, string]> = [
  ['latest', 'Latest'], ['top', 'Top'], ['tender', 'Tender'], ['loksewa', 'Loksewa'], ['ipo', 'IPO/FPO'],
];

interface FeedItem {
  id?: string;
  uuid?: string;
  title?: string;
  titleEn?: string;
  content?: string;
  status?: string;
  publishedDate?: string;
  createdAt?: string;
  url?: string;
  fileUrl?: string;
  author?: { department?: string };
  likes?: unknown[];
  attachments?: unknown[];
}

interface FeedResponse {
  items?: FeedItem[];
  nextCursor?: string | null;
}

interface LoksewaResponse extends FeedResponse {
  notices?: FeedItem[];
  hasMore?: boolean;
}

interface FrameMessageEvent extends MessageEvent {
  data: { source?: string; type?: string; height?: number };
}

try {
  localStorage.removeItem('nepal-translator-settings');
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('nepal-translation-') && !key.startsWith('nepal-translation-native-')) localStorage.removeItem(key);
  }
} catch {
  // The app also works when browser storage is disabled.
}

function Icon({ icon: IconComponent, ...props }: { icon: LucideIcon } & React.ComponentProps<LucideIcon>) {
  return <IconComponent aria-hidden="true" focusable="false" {...props} />;
}

function App() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('feed') === 'loksewa') return 'loksewa';
    if (params.get('feed') === 'ipo') return 'ipo';
    if (params.get('department') === 'Tender') return 'tender';
    return params.get('sort') === 'top' ? 'top' : 'latest';
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loksewaPages, setLoksewaPages] = useState<LoksewaResponse[]>([]);
  const [loksewaPage, setLoksewaPage] = useState(1);
  const [hasMoreLoksewa, setHasMoreLoksewa] = useState(false);
  const [frameHeight, setFrameHeight] = useState(180);
  const [feedTransition, setFeedTransition] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const transitionFrame = useRef<number | null>(null);
  const feedFrame = useRef<HTMLIFrameElement | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('nepal-updates-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('nepal-updates-theme', theme);
    } catch {
      // The selected theme remains active until this page closes.
    }
  }, [theme]);

  useEffect(() => {
  const handleFrameMessage = (event: FrameMessageEvent) => {
      if (event.source !== feedFrame.current?.contentWindow || event.data?.source !== 'nepal-feed-frame') return;
      if (event.data.type === 'height' && typeof event.data.height === 'number' && Number.isFinite(event.data.height)) setFrameHeight(Math.max(120, event.data.height));
    };
    window.addEventListener('message', handleFrameMessage);
    return () => window.removeEventListener('message', handleFrameMessage);
  }, []);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    if (transitionFrame.current !== null) window.cancelAnimationFrame(transitionFrame.current);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 500);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  const loadFeed = useCallback(async ({ cursor = null, append = false, signal }: { cursor?: string | null; append?: boolean; signal?: AbortSignal } = {}) => {
    setStatus((current) => current === 'loading' ? 'loading' : 'refreshing');
    try {
      const params = new URLSearchParams();
      if (filter === 'tender') params.set('department', 'Tender');
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`${FEED_URL}${params.size ? `?${params}` : ''}`, { headers: { Accept: 'application/json' }, signal });
      if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
      const data = await response.json() as FeedResponse | FeedItem[];
      const updates = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(updates)) throw new Error('Unexpected feed response');
      setItems((current) => append ? [...current, ...updates] : updates.filter((item) => !item.status || item.status === 'APPROVED'));
      setNextCursor(Array.isArray(data) ? null : data.nextCursor ?? null);
      setLastUpdated(new Date());
      setStatus('success');
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Unable to load Nepal government updates:', error);
      setStatus('error');
    }
  }, [filter]);

  const refreshSelectedFeed = () => {
    setStatus(items.length ? 'refreshing' : 'loading');
    if (filter === 'ipo') {
      void fetch('/api/ipo').then(async (response) => {
        if (!response.ok) throw new Error(`IPO/FPO request failed (${response.status})`);
        const data = await response.json() as FeedResponse;
        if (!Array.isArray(data.items)) throw new Error('Unexpected IPO/FPO response');
        setItems(data.items);
        setNextCursor(data.nextCursor ?? null);
        setLastUpdated(new Date());
        setStatus('success');
      }).catch((error: unknown) => {
        console.error('Unable to refresh IPO/FPO news:', error);
        setStatus('error');
      });
      return;
    }
    if (filter === 'loksewa') {
      void fetch('/api/loksewa?page=1').then(async (response) => {
        if (!response.ok) throw new Error(`Loksewa request failed (${response.status})`);
        const data = await response.json() as LoksewaResponse;
        setLoksewaPages([data]);
        setHasMoreLoksewa(Boolean(data.hasMore));
        setLastUpdated(new Date());
        setStatus('success');
      }).catch((error: unknown) => {
        console.error('Unable to refresh Loksewa notices:', error);
        setStatus('error');
      });
      return;
    }
    void loadFeed();
  };

  useEffect(() => {
    const controller = new AbortController();
    if (filter === 'ipo') {
      setStatus('loading');
      const fetchIpo = async () => {
        try {
          const response = await fetch('/api/ipo', { signal: controller.signal });
          if (!response.ok) throw new Error(`IPO/FPO request failed (${response.status})`);
          const data = await response.json() as FeedResponse;
          if (!Array.isArray(data.items)) throw new Error('Unexpected IPO/FPO response');
          setItems(data.items);
          setNextCursor(data.nextCursor ?? null);
          setLastUpdated(new Date());
          setStatus('success');
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error('Unable to load IPO/FPO news:', error);
          setStatus('error');
        }
      };
      void fetchIpo();
      const timer = window.setInterval(() => void fetchIpo(), 5 * 60 * 1000);
      return () => { window.clearInterval(timer); controller.abort(); };
    }
    if (filter === 'loksewa') {
      setStatus('loading');
      setLoksewaPages([]);
      setLoksewaPage(1);
      void fetch('/api/loksewa?page=1', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Loksewa request failed (${response.status})`);
        return await response.json() as LoksewaResponse;
      }).then((data) => {
        setLoksewaPages([data]);
        setHasMoreLoksewa(Boolean(data.hasMore));
        setStatus('success');
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Unable to load Loksewa notices:', error);
        setStatus('error');
      });
      return () => controller.abort();
    }
    void loadFeed({ signal: controller.signal });
    const timer = window.setInterval(() => void loadFeed({ signal: controller.signal }), 5 * 60 * 1000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [loadFeed]);

  const changeFilter = (nextFilter: FeedFilter) => {
    if (nextFilter === filter) return;
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    if (transitionFrame.current !== null) window.cancelAnimationFrame(transitionFrame.current);
    setFeedTransition(true);
    transitionTimer.current = window.setTimeout(() => {
    setFilter(nextFilter);
    setItems([]);
    setLoksewaPages([]);
    setLoksewaPage(1);
    setNextCursor(null);
    setHasMoreLoksewa(false);
    setStatus('loading');
    const params = new URLSearchParams(window.location.search);
    params.delete('sort');
    params.delete('department');
    params.delete('feed');
    if (nextFilter === 'top') params.set('sort', 'top');
    if (nextFilter === 'tender') params.set('department', 'Tender');
    if (nextFilter === 'loksewa') params.set('feed', 'loksewa');
    if (nextFilter === 'ipo') params.set('feed', 'ipo');
    const queryString = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`);
      transitionFrame.current = window.requestAnimationFrame(() => {
        transitionFrame.current = window.requestAnimationFrame(() => setFeedTransition(false));
      });
    }, 140);
  };

  const loadMore = async () => {
    if (filter === 'ipo') {
      if (!nextCursor || loadingMore) return;
      setLoadingMore(true);
      try {
        const params = new URLSearchParams({ cursor: nextCursor });
        const response = await fetch(`/api/ipo?${params}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`IPO/FPO request failed (${response.status})`);
        const data = await response.json() as FeedResponse;
        const pageItems = data.items;
        if (!Array.isArray(pageItems)) throw new Error('Unexpected IPO/FPO response');
        if (pageItems.length === 0 || pageItems.every((item) => items.some((current) => current.url === item.url || current.id === item.id))) {
          setNextCursor(null);
          return;
        }
        setItems((current) => [...current, ...pageItems.filter((item) => !current.some((existing) => existing.url === item.url || existing.id === item.id))]);
        setNextCursor(data.nextCursor ?? null);
      } catch (error) {
        console.error('Unable to load more IPO/FPO news:', error);
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    if (filter === 'loksewa') {
      if (!hasMoreLoksewa || loadingMore) return;
      setLoadingMore(true);
      try {
        const page = loksewaPage + 1;
        const response = await fetch(`/api/loksewa?page=${page}`);
        if (!response.ok) throw new Error(`Loksewa request failed (${response.status})`);
        const data = await response.json() as LoksewaResponse;
        setLoksewaPages((current) => [...current, data]);
        setLoksewaPage(page);
        setHasMoreLoksewa(Boolean(data.hasMore));
      } catch (error) {
        console.error('Unable to load more Loksewa notices:', error);
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      if (filter === 'tender') params.set('department', 'Tender');
      const response = await fetch(`${FEED_URL}?${params}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
      const data = await response.json() as FeedResponse;
      setItems((current) => [...current, ...(data.items || [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      console.error('Unable to load more updates:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const rows: FeedItem[] = filter === 'loksewa'
      ? loksewaPages.flatMap((page) => page.items || page.notices || [])
      : items;
    const matches = needle ? rows.filter((item) => `${item.title ?? item.titleEn ?? ''} ${item.content ?? ''} ${item.author?.department ?? ''}`.toLocaleLowerCase().includes(needle)) : rows;
    return filter === 'top' ? [...matches].sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0)) : matches;
  }, [items, loksewaPages, query, filter]);

  const sendFeedToFrame = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    event.currentTarget.contentWindow?.postMessage({
      source: 'nepal-feed-parent',
      items: filteredItems,
      filter,
      theme,
    }, window.location.origin);
  };

  useEffect(() => {
    feedFrame.current?.contentWindow?.postMessage({
      source: 'nepal-feed-parent',
      items: filteredItems,
      filter,
      theme,
    }, window.location.origin);
  }, [filteredItems, filter, theme]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Nepal updates home">
          <span className="brand-mark"><Icon icon={Landmark} size={19} /></span>
          <span className="brand-copy"><strong>Nepal Updates</strong><small>Fetched from nepal.gov.np</small></span>
        </a>
        <nav className="top-links" aria-label="Main navigation">
          <a className="nav-active" href="#updates">Latest updates</a>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">Official portal <Icon icon={ArrowUpRight} size={14} /></a>
        </nav>
        <div className="header-actions">
          <button className="utility-button theme-button" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon icon={theme === 'dark' ? Sun : Moon} size={18} /><span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      <main id="top">
        <a className="skip-link" href="#updates">Skip to updates</a>
        <section className="feed-section" id="updates">
          <div className="section-heading">
            <div><h1>{filter === 'ipo' ? 'IPO/FPO News' : 'Latest updates'}</h1><p className="section-description">{filter === 'ipo' ? 'IPO and FPO news from Sharesansar.' : <>News and notices from Nepal’s government. <span className="translation-note">Use Chrome’s Translate this page option to translate the feed.</span></>}</p></div>
            <div className="feed-meta"><span className="update-count">{filteredItems.length.toString().padStart(2, '0')} <small>{filter === 'ipo' ? 'STORIES' : 'UPDATES'}</small></span><span className="meta-divider" />
              <span className="updated-time"><Icon icon={Clock3} size={16} /> {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting to feed'}</span>
              <button className="refresh-button" onClick={refreshSelectedFeed} disabled={status === 'loading' || status === 'refreshing'} aria-label="Refresh updates"><Icon icon={RefreshCw} size={15} className={status === 'refreshing' ? 'spin' : ''} /></button>
            </div>
          </div>

          <div className="feed-toolbar">
            <div className="feed-tabs" role="tablist" aria-label="Update filter">
              {FILTER_TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'is-active' : ''} onClick={() => changeFilter(key)}>{label}</button>)}
            </div>
            <label className="search-box"><Icon icon={Search} size={17} /><input name="search-updates" autoComplete="off" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search updates…" aria-label="Search updates" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label>
          </div>

          <div className={`feed-content${feedTransition ? ' is-transitioning' : ''}`} aria-busy={status === 'loading'}>
          {status === 'loading' && <p className="result-summary" aria-live="polite">Loading {filter === 'loksewa' ? 'Loksewa notices' : filter === 'ipo' ? 'IPO/FPO news' : 'updates'}…</p>}
          {status === 'error' && filteredItems.length === 0 && <div className="state-message error-state"><span>{filter === 'loksewa' ? 'The Public Service Commission feed is currently unavailable.' : `We couldn’t reach the ${filter === 'ipo' ? 'Sharesansar IPO/FPO' : 'official updates'} feed.`}</span><button onClick={refreshSelectedFeed}>Try again <Icon icon={RefreshCw} size={14} /></button></div>}
          {status !== 'loading' && status !== 'error' && filteredItems.length === 0 && <div className="state-message">{query ? `No updates match “${query}”. Try another search.` : `No ${filter === 'loksewa' ? 'Loksewa notices' : filter === 'ipo' ? 'IPO/FPO news' : 'updates'} found for this filter.`}</div>}
          <div className="feed-frame-shell" style={{ minHeight: `${Math.max(frameHeight, 220)}px` }}>
            <iframe ref={feedFrame} className="updates-frame" title={filter === 'ipo' ? 'IPO/FPO news feed' : 'Government news feed'} src="/feed-frame.html" onLoad={sendFeedToFrame} style={{ height: `${frameHeight}px` }} />
          </div>
          </div>
          {filteredItems.length > 0 && (filter === 'loksewa' ? hasMoreLoksewa : Boolean(nextCursor)) && <div className="load-more-wrap"><button className="load-more-button" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><Icon icon={LoaderCircle} size={16} className="spin" /> Loading…</> : <>Load More <Icon icon={ArrowDown} size={15} /></>}</button></div>}
          {filteredItems.length > 0 && !(filter === 'loksewa' ? hasMoreLoksewa : nextCursor) && <div className="feed-end"><span /> YOU’RE ALL CAUGHT UP <span /></div>}
          <div className="source-note"><span>{filter === 'ipo' ? 'Fetched from Sharesansar' : 'Fetched from nepal.gov.np'}</span><a href={filter === 'ipo' ? 'https://www.sharesansar.com/category/ipo-fpo-news' : `${SOURCE_URL}/updates`} target="_blank" rel="noreferrer">Open {filter === 'ipo' ? 'Sharesansar' : 'official'} feed <Icon icon={ArrowUpRight} size={14} /></a></div>
        </section>
      </main>

      <footer><a className="footer-brand" href="#top">Nepal Updates</a><a href={SOURCE_URL} target="_blank" rel="noreferrer">nepal.gov.np <Icon icon={ArrowUpRight} size={14} /></a></footer>
      {showBackToTop && <button className="back-to-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} aria-label="Back to top" title="Back to top"><Icon icon={ArrowUp} size={20} /><span>Top</span></button>}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount point');
createRoot(root).render(<App />);
