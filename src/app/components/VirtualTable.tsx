/* ============================================================
   RELIQ — Lightweight Zero-Dependency Virtual Table Windowing
   
   Renders large test-case datasets (100–1,000+ cases) at steady
   60 FPS by rendering only visible rows plus an overscan buffer.
   ============================================================ */

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualTableProps<T> {
  items: T[];
  itemHeight: number;
  height: number | string;
  renderRow: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  header?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export function VirtualTable<T>({
  items,
  itemHeight,
  height,
  renderRow,
  overscan = 5,
  header,
  emptyState,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (!items || items.length === 0) {
    return <>{emptyState || null}</>;
  }

  const totalHeight = items.length * itemHeight;
  const containerHeightNum = typeof height === 'number' ? height : 500;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeightNum) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: '#161B22',
        overflow: 'hidden',
      }}
    >
      {header && (
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: '#0D1117' }}>
          {header}
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{
          height,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
          <div
            style={{
              transform: `translateY(${offsetY}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
            }}
          >
            {visibleItems.map((item, i) => renderRow(item, startIndex + i))}
          </div>
        </div>
      </div>
    </div>
  );
}
