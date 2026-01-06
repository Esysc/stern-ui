import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StreamTabs } from '../StreamTabs';

describe('StreamTabs', () => {
  const defaultProps = {
    streams: [
      { id: 1, name: 'Stream 1' },
      { id: 2, name: 'Stream 2' }
    ],
    activeStreamId: 1,
    onSelectStream: vi.fn(),
    onAddStream: vi.fn(),
    onRemoveStream: vi.fn()
  };

  it('renders all stream tabs', () => {
    render(<StreamTabs {...defaultProps} />);

    expect(screen.getByText('Stream 1')).toBeInTheDocument();
    expect(screen.getByText('Stream 2')).toBeInTheDocument();
  });

  it('renders add stream button', () => {
    render(<StreamTabs {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add stream/i })).toBeInTheDocument();
  });

  it('calls onSelectStream when clicking a tab', () => {
    const handleSelect = vi.fn();
    render(<StreamTabs {...defaultProps} onSelectStream={handleSelect} />);

    fireEvent.click(screen.getByText('Stream 2'));

    expect(handleSelect).toHaveBeenCalledWith(2);
  });

  it('calls onAddStream when clicking add button', () => {
    const handleAdd = vi.fn();
    render(<StreamTabs {...defaultProps} onAddStream={handleAdd} />);

    fireEvent.click(screen.getByRole('button', { name: /add stream/i }));

    expect(handleAdd).toHaveBeenCalled();
  });

  it('shows remove button for each tab when multiple streams exist', () => {
    render(<StreamTabs {...defaultProps} />);

    const closeButtons = screen.getAllByRole('button', { name: /✕/i });
    expect(closeButtons).toHaveLength(2);
  });

  it('calls onRemoveStream when clicking remove button', () => {
    const handleRemove = vi.fn();
    render(<StreamTabs {...defaultProps} onRemoveStream={handleRemove} />);

    const closeButtons = screen.getAllByRole('button', { name: /✕/i });
    fireEvent.click(closeButtons[0]);

    expect(handleRemove).toHaveBeenCalledWith(1);
  });

  it('does not show remove buttons when only one stream', () => {
    const singleStream = { ...defaultProps, streams: [{ id: 1, name: 'Stream 1' }] };
    render(<StreamTabs {...singleStream} />);

    expect(screen.queryByRole('button', { name: /✕/i })).not.toBeInTheDocument();
  });

  it('highlights active tab', () => {
    render(<StreamTabs {...defaultProps} />);

    const stream1 = screen.getByText('Stream 1').closest('div');
    const stream2 = screen.getByText('Stream 2').closest('div');

    expect(stream1).toHaveClass('border-green-500');
    expect(stream2).not.toHaveClass('border-green-500');
  });
});
