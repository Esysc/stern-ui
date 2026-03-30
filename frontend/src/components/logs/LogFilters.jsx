import { memo } from 'react';
import PropTypes from 'prop-types';
import { InputField, SelectField } from '../common';

const LOG_LEVELS = ['all', 'debug', 'info', 'warn', 'error'];

/**
 * Log filtering controls
 */
const LogFiltersComponent = ({
  searchFilter,
  onSearchChange,
  levelFilter,
  onLevelChange,
  onResetFilters,
  levelCounts = {}
}) => {
  const hasActiveFilters = searchFilter.trim() !== '' || levelFilter !== 'all';

  return (
    <div className="flex gap-4 items-end">
      <InputField
        label="Search"
        value={searchFilter}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Filter logs..."
        className="flex-1"
      />

      <SelectField
        label="Level"
        value={levelFilter}
        onChange={(e) => onLevelChange(e.target.value)}
        options={LOG_LEVELS.map(level => ({
          value: level,
          label: level === 'all'
            ? `All (${Object.values(levelCounts).reduce((a, b) => a + b, 0)})`
            : `${level.charAt(0).toUpperCase() + level.slice(1)} (${levelCounts[level] || 0})`
        }))}
        className="w-48"
      />

      <button
        onClick={onResetFilters}
        disabled={!hasActiveFilters}
        className="h-10 px-3 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
        aria-label="Reset log filters"
        title="Reset search and level filters"
      >
        Reset
      </button>
    </div>
  );
};

LogFiltersComponent.propTypes = {
  searchFilter: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  levelFilter: PropTypes.string.isRequired,
  onLevelChange: PropTypes.func.isRequired,
  onResetFilters: PropTypes.func.isRequired,
  levelCounts: PropTypes.objectOf(PropTypes.number)
};

export const LogFilters = memo(LogFiltersComponent);
