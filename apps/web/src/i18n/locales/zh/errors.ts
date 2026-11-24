import type en from "../en";

const errors: typeof en.errors = {
	generic: "出错了，请重试。",
	codes: {
		ORG_FROZEN: "组织已被冻结，请先联系所有者解冻。",
		PLAN_LIMIT_EXCEEDED: "已达到当前方案上限，请升级后继续。",
		NOT_FOUND: "该内容不存在或已被删除。",
		FORBIDDEN: "你没有权限执行此操作。",
		UNAUTHORIZED: "请重新登录后再试。",
		VALIDATION: "部分填写内容无效，请检查后重试。",
		CONFLICT: "该操作与当前状态冲突，请刷新后重试。",
		STATUS_NAME_TAKEN: "该状态名称已存在。",
		STATUS_LAST_STATUS: "组织至少需要保留一个工作流状态。",
		STATUS_MIGRATION_REQUIRED: "请先将使用该状态的事项迁移到其他状态再删除。",
		STATUS_MIGRATION_INVALID: "请选择该组织内有效的目标状态。",
		ISSUE_PARENT_INVALID: "父事项必须属于同一项目，请选择其他事项。",
		ISSUE_PARENT_DEPTH:
			"子事项最多支持两层，请先移除当前父事项或选择顶层事项。",
		ISSUE_RELATION_INVALID: "不允许该关联：事项必须属于同一项目且不能是自身。",
		ISSUE_RELATION_EXISTS: "这两个事项已经存在相同类型的关联。",
		ISSUE_RELATION_CYCLE:
			"阻塞关系不能形成环，请先移除或调整其中一个阻塞关联。",
		PROJECT_ARCHIVED:
			"该项目已归档，处于只读状态。请先在项目设置中恢复项目再修改。",
		CYCLE_OVERLAP: "所选日期与某个已有周期重叠，请调整日期范围。",
		CYCLE_RANGE_INVALID: "结束日期不能早于开始日期。",
		CYCLE_TARGET_INVALID: "请选择另一个尚未结束的周期作为目标。",
		VIEW_LIMIT_REACHED:
			"已达到当前方案的保存视图上限。请升级方案，或请所有者/管理员为团队创建共享视图。",
		VIEW_NOT_FOUND: "该视图不存在或对你不可见。",
		MCP_FORBIDDEN_SCOPE: "此操作需要权限范围更高的 API 密钥。",
	},
	orgSettingsRequired: "只有所有者或管理员可以修改组织设置。",
	orgLeaveOwner: "所有者需先转移所有权才能退出组织。",
	invalidEmailOrPassword: "邮箱或密码错误。",
	userAlreadyExists: "该邮箱已注册过账号。",
};

export default errors;
