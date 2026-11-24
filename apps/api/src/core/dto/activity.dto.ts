export type ActivityActorDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type ActivityDto = {
	id: string;
	orgId: string;
	projectId: string;
	issueId: string;
	action: string;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
	actor: ActivityActorDto;
	createdAt: string;
};

export type OrgActivityDto = ActivityDto & {
	issue: { id: string; number: number; title: string } | null;
	project: { id: string; key: string; name: string } | null;
};
