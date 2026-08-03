import type {ReactNode} from 'react';
import {useLocation, useParams} from 'wouter';

import {ProjectForm} from '../components/ProjectForm';
import {QueryState} from '../components/AppLayout';
import {useProject, useSaveProject} from '../queries/projects';

export function NewProjectPage() {
  const {yearId} = useParams<{yearId: string}>();
  const [, navigate] = useLocation();
  const save = useSaveProject();
  return (
    <EditorShell
      title="Put it on the board"
      detail="A good proposal is specific enough to start and strange enough to matter."
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
  const claim = new URLSearchParams(window.location.search).has('claim');
  const save = useSaveProject(projectId, claim);
  return (
    <QueryState loading={project.isLoading} error={project.error}>
      {project.data && (
        <EditorShell
          title={claim ? 'Take the baton' : 'Refine the experiment'}
          detail={
            claim
              ? 'Turn this open idea into a real team project.'
              : 'Keep the project record useful for collaborators and future archaeologists.'
          }
        >
          <ProjectForm
            yearId={yearId}
            project={project.data.project}
            claim={claim}
            saving={save.isPending}
            error={save.error?.message ?? null}
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
        <p className="kicker">Project registry</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </header>
      {children}
    </main>
  );
}
