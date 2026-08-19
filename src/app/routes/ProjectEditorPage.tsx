import type {ReactNode} from 'react';
import {useLocation, useParams} from 'wouter';

import {ProjectForm} from '../components/ProjectForm';
import {QueryState} from '../components/AppLayout';
import {useProject, useSaveProject, useYear} from '../queries/projects';

export function NewProjectPage() {
  const {yearId} = useParams<{yearId: string}>();
  const [, navigate] = useLocation();
  const save = useSaveProject();
  return (
    <EditorShell
      title="add a project"
      detail="share what you want to build and who you want to build it with."
    >
      <ProjectForm
        yearId={yearId}
        saving={save.isPending}
        error={save.error?.message ?? null}
        onCancel={() => navigate(`/years/${yearId}/projects`)}
        onSubmit={(input) =>
          save.mutate(input, {
            onSuccess: ({project}) => navigate(`/years/${yearId}/projects/${project.id}`),
          })
        }
      />
    </EditorShell>
  );
}

export function EditProjectPage() {
  const {yearId, projectId} = useParams<{
    yearId: string;
    projectId: string;
  }>();
  const [, navigate] = useLocation();
  const project = useProject(projectId);
  const year = useYear(yearId);
  const claim = new URLSearchParams(window.location.search).has('claim');
  const save = useSaveProject(projectId, claim);
  return (
    <QueryState
      loading={project.isLoading || year.isLoading}
      error={project.error ?? year.error}
    >
      {project.data && year.data && (
        <EditorShell
          title={claim ? 'claim this idea' : 'edit project'}
          detail={
            claim
              ? 'turn this open idea into a team project.'
              : 'keep the project details useful for your team and everyone following along.'
          }
        >
          <ProjectForm
            yearId={yearId}
            project={project.data.project}
            claim={claim}
            saving={save.isPending}
            error={save.error?.message ?? null}
            nominationsReadOnly={!claim && year.data.year.votingEnabled}
            onCancel={() => navigate(`/years/${yearId}/projects/${projectId}`)}
            onSubmit={(input) =>
              save.mutate(input, {
                onSuccess: () => navigate(`/years/${yearId}/projects/${projectId}`),
              })
            }
          />
        </EditorShell>
      )}
    </QueryState>
  );
}

function EditorShell({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <main className="editorPage">
      <header>
        <p className="kicker">Hackweek project</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </header>
      {children}
    </main>
  );
}
