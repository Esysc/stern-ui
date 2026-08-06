import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PodContainerSelect } from '../PodContainerSelect';

const options = [
  { pod: 'web-1', containers: ['main', 'sidecar'] },
  { pod: 'api-1', containers: ['api'] },
];

describe('PodContainerSelect', () => {
  it('shows placeholder when nothing selected', () => {
    render(<PodContainerSelect options={options} selected={[]} onChange={() => {}} idPrefix="t" />);
    expect(screen.getByText(/Select a pod/i)).toBeInTheDocument();
  });

  it('shows selected pod/container as a chip', () => {
    render(<PodContainerSelect options={options} selected={['web-1/main']} onChange={() => {}} idPrefix="t" />);
    expect(screen.getByText('web-1')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('opens dropdown and lets the user pick a container', () => {
    const onChange = vi.fn();
    render(<PodContainerSelect options={options} selected={[]} onChange={onChange} idPrefix="t" />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('web-1'));

    fireEvent.mouseDown(screen.getByText('sidecar'));
    expect(onChange).toHaveBeenCalledWith(['web-1/sidecar']);
  });

  it('removes selection when the x is clicked', () => {
    const onChange = vi.fn();
    render(<PodContainerSelect options={options} selected={['api-1/api']} onChange={onChange} idPrefix="t" />);

    fireEvent.click(screen.getByLabelText('Remove api-1/api'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
