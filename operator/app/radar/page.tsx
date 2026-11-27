'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Palette,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { applyUiTheme, getSavedUiTheme, UI_THEMES, type UiTheme } from '@/lib/theme';
import { RADAR_CATEGORIES, type TechRadarItem } from '@/lib/radar/types';

const FILTERS = ['All', ...RADAR_CATEGORIES, 'Saved'] as const;

export default function TechRadarPage() {
  const [items, setItems] = useState<TechRadarItem[]>([]);
  const [fetchedDate, setFetchedDate] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState<UiTheme>('light');

  useEffect(() => {
    const saved = getSavedUiTheme();
    setTheme(saved);
    applyUiTheme(saved);
  }, []);

  const loadRadar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/radar', { cache: 'no-store' });
      const json = (await res.json()) as { items?: TechRadarItem[]; fetchedDate?: string };
      if (res.ok && json.items) {
        setItems(json.items);
        setFetchedDate(json.fetchedDate ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRadar();
  }, [loadRadar]);

  async function handleRefresh() {
    setRefreshing(true);
    setNotice('');
    try {
      const res = await fetch('/api/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      const json = (await res.json()) as { items?: TechRadarItem[]; fetchedDate?: string };
      if (res.ok && json.items) {
        setItems(json.items);
        setFetchedDate(json.fetchedDate ?? '');
        setNotice('Tech Radar refreshed from GitHub, Hacker News & DEV.to');
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handleToggleSave(id: string) {
    const res = await fetch('/api/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_save', id }),
    });
    const json = (await res.json()) as { items?: TechRadarItem[] };
    if (res.ok && json.items) setItems(json.items);
  }

  async function handleSendToCareer(item: TechRadarItem) {
    setNotice('');
    const res = await fetch('/api/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_to_career',
        title: item.title,
        howToUse: item.howToUse,
      }),
    });
    const json = (await res.json()) as { message?: string };
    if (res.ok && json.message) setNotice(json.message);
  }

  function handleThemeChange(nextTheme: UiTheme) {
    setTheme(nextTheme);
    applyUiTheme(nextTheme);
  }

  const visibleItems = items.filter((item) => {
    if (filter === 'All') return true;
    if (filter === 'Saved') return item.saved;
    return item.category === filter;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Operator
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-sm font-semibold tracking-tight">Tech Radar</h1>
            {fetchedDate && <Badge variant="muted">{fetchedDate}</Badge>}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/career"
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2"
            >
              Career →
            </Link>
            <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Curating...' : 'Refresh'}
            </Button>
            <div className="relative flex items-center">
              <Palette className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                aria-label="UI Style"
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as UiTheme)}
                className="h-8 rounded-lg border border-border bg-card pl-8 pr-2.5 text-xs font-medium text-foreground focus:outline-none"
              >
                {UI_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Outside Tech World</h2>
          <p className="text-xs text-muted-foreground">
            Trending GitHub repos, dev tools, AI workflows, and security signals — distilled so you stay sharp without doom-scrolling.
          </p>
        </div>

        {notice && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-600">
            {notice}
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={filter === cat ? 'default' : 'outline'}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Feed */}
        {loading && items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-muted-foreground">
              Fetching today&apos;s signals from GitHub, Hacker News &amp; DEV.to...
            </CardContent>
          </Card>
        ) : visibleItems.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-xs text-muted-foreground">
              No items in &ldquo;{filter}&rdquo;.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default">{item.category}</Badge>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {item.source} · {item.metric}
                        </span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline"
                      >
                        {item.title}
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant={item.saved ? 'default' : 'outline'}
                        onClick={() => handleToggleSave(item.id)}
                        title="Bookmark item"
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                        {item.saved ? 'Saved' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendToCareer(item)}
                        title="Add as practical task in Career Roadmap"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Try in Career
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-foreground">{item.tldr}</p>
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <strong className="text-foreground">How to use / integrate:</strong> {item.howToUse}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
