'use client';

import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export function CalendarDay({
  day,
  isCurrentMonth,
  isToday,
  events,
  onEventClick,
}: {
  day: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: { jobs: any[]; services: any[] };
  onEventClick: (event: any) => void;
}) {
  const totalEvents = events.jobs.length + events.services.length;

  return (
    <div
      className={`min-h-32 border-b border-r p-2 ${
        !isCurrentMonth ? 'bg-gray-50' : 'bg-white'
      } ${isToday ? 'bg-blue-50' : ''}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-sm font-medium ${
            isToday
              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white'
              : isCurrentMonth
              ? 'text-gray-900'
              : 'text-gray-400'
          }`}
        >
          {format(day, 'd')}
        </span>
        {totalEvents > 0 && (
          <span className="text-xs text-gray-500">{totalEvents}</span>
        )}
      </div>

      <div className="space-y-1">
        {/* Jobs */}
        {events.jobs.slice(0, 2).map((job) => (
          <button
            key={job.id}
            onClick={() => onEventClick({ type: 'job', data: job })}
            className="w-full rounded bg-blue-100 px-2 py-1 text-left text-xs hover:bg-blue-200"
          >
            <div className="flex items-center gap-1">
              <Badge variant="info" className="text-xs px-1 py-0">
                JOB
              </Badge>
              <span className="truncate font-medium text-blue-900">
                {job.job_number}
              </span>
            </div>
          </button>
        ))}

        {/* Services */}
        {events.services.slice(0, 2).map((service) => (
          <button
            key={service.id}
            onClick={() => onEventClick({ type: 'service', data: service })}
            className="w-full rounded bg-green-100 px-2 py-1 text-left text-xs hover:bg-green-200"
          >
            <div className="flex items-center gap-1">
              <Badge variant="success" className="text-xs px-1 py-0">
                SVC
              </Badge>
              <span className="truncate font-medium text-green-900">
                {service.service_type}
              </span>
            </div>
          </button>
        ))}

        {/* Show more indicator */}
        {totalEvents > 2 && (
          <div className="text-center text-xs text-gray-500">
            +{totalEvents - 2} more
          </div>
        )}
      </div>
    </div>
  );
}
