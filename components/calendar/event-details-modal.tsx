// Legacy component — currently not used in calendar
'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

const statusColors: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  need_to_schedule: 'warning',
  scheduled: 'info',
  pending_information: 'warning',
  failed: 'danger',
  completed: 'success',
  pending: 'default',
  completed_paperwork_pending: 'warning',
  failed_retest_needed: 'danger',
  closed: 'info',
};

export function EventDetailsModal({
  event,
  onClose,
}: {
  event: { type: 'job' | 'service'; data: any };
  onClose: () => void;
}) {
  const isJob = event.type === 'job';
  const data = event.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {isJob ? 'Job Details' : 'Service Details'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title & Status */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-medium text-gray-900">
                {data.title}
              </h3>
              <Badge variant={statusColors[data.status]}>
                {data.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            
            {isJob ? (
              <p className="text-sm text-gray-600">Job #{data.job_number}</p>
            ) : (
              <p className="text-sm text-gray-600">
                {data.service_type} • Job #{data.job.job_number}
              </p>
            )}
          </div>

          {/* Customer */}
          {isJob && data.customer && (
            <div>
              <p className="text-sm font-medium text-gray-700">Customer</p>
              <p className="text-sm text-gray-900">{data.customer.name}</p>
            </div>
          )}

          {!isJob && data.job.customer && (
            <div>
              <p className="text-sm font-medium text-gray-700">Customer</p>
              <p className="text-sm text-gray-900">{data.job.customer.name}</p>
            </div>
          )}

          {/* Scheduled Time */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Scheduled</p>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-900">
                {format(parseISO(data.scheduled_at), 'PPp')}
              </span>
            </div>
          </div>

          {/* View Full Details Link */}
          <div className="border-t pt-4">
            {isJob ? (
              <Link href={`/jobs/${data.id}`}>
                <Button variant="outline" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Full Job Details
                </Button>
              </Link>
            ) : (
              <Link href={`/jobs/${data.job.id}/services/${data.id}`}>
                <Button variant="outline" className="w-full">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Full Service Details
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
