'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';
import { updateJobSchedule, updateServiceSchedule } from '@/lib/actions/calendar';

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
  onUpdate,
}: {
  event: { type: 'job' | 'service'; data: any };
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [newDateTime, setNewDateTime] = useState('');

  const isJob = event.type === 'job';
  const data = event.data;

  const handleReschedule = async () => {
    if (!newDateTime) return;

    try {
      if (isJob) {
        await updateJobSchedule(data.id, newDateTime);
      } else {
        await updateServiceSchedule(data.id, newDateTime);
      }
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to reschedule:', error);
      alert('Failed to reschedule. Please try again.');
    }
  };

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

          {/* Reschedule Section */}
          {!isRescheduling ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRescheduling(true)}
            >
              Reschedule
            </Button>
          ) : (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <label className="mb-2 block text-sm font-medium text-gray-900">
                New Date & Time
              </label>
              <input
                type="datetime-local"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleReschedule} disabled={!newDateTime}>
                  Confirm Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsRescheduling(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

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
