import { Clock, Trash2 } from "lucide-react";

export interface JobRecord {
  job_id: string;
  filename: string;
  total_samples: number;
  created_at: string;
}

interface Props {
  jobs: JobRecord[];
  activeJobId: string | null;
  onSelect: (jobId: string) => void;
  onRemove: (jobId: string) => void;
}

export default function JobHistory({ jobs, activeJobId, onSelect, onRemove }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="pixel-card p-4 text-center text-muted-foreground text-[0.7rem]">
        No batch jobs submitted yet
      </div>
    );
  }

  return (
    <div className="pixel-card p-4">
      <h3 className="font-[family-name:var(--font-pixel-title)] text-[0.6rem] mb-3 tracking-wide">
        JOB HISTORY
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {jobs.map((job) => (
          <div
            key={job.job_id}
            className={`flex items-center gap-3 p-3 border-2 cursor-pointer transition-colors ${activeJobId === job.job_id
                ? "border-primary bg-primary/10"
                : "border-border-light bg-card hover:border-foreground"
              }`}
            onClick={() => onSelect(job.job_id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[0.7rem] font-bold truncate">{job.filename}</p>
              <div className="flex items-center gap-3 mt-1 text-[0.6rem] text-muted-foreground">
                <span className="font-mono">{job.job_id}</span>
                <span>{job.total_samples} samples</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(job.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(job.job_id); }}
              className="text-muted-foreground hover:text-destructive p-1"
              title="Remove from history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
