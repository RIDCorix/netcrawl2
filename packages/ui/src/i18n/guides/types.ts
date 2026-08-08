export type GuideSkeleton =
  | 'codespace-create'
  | 'codespace-editor'
  | 'codespace-terminal'
  | 'codespace-run'
  | 'codespace-stop';

export interface GuideStep {
  title: string;
  content: string;
  skeleton?: GuideSkeleton;
}
