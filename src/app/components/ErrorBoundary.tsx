import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RELIQ ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/app/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '3rem',
            margin: '2rem auto',
            maxWidth: '700px',
            background: 'rgba(255, 34, 0, 0.05)',
            border: '1px solid rgba(255, 51, 17, 0.3)',
            borderRadius: '10px',
            color: '#ECECEC',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem', color: '#FF4422' }}>⚠</span>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#FF5533', fontWeight: 700 }}>
              {this.props.fallbackTitle || 'Component Render Exception Intercepted'}
            </h2>
          </div>
          <p style={{ fontSize: '0.88rem', color: '#AAAAAA', lineHeight: 1.6, margin: '0 0 1.2rem' }}>
            A runtime error occurred while rendering this view. The RELIQ application container remains active and safe.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '1rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: '#FFAA99',
                overflowX: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                margin: '0 0 1.5rem',
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: 'rgba(255, 107, 53, 0.2)',
                border: '1px solid #FF6B35',
                color: '#FF6B35',
                padding: '0.5rem 1.2rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Render
            </button>
            <button
              onClick={this.handleReset}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ECECEC',
                padding: '0.5rem 1.2rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
