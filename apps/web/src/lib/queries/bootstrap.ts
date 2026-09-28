import type { BootstrapDto } from "@api/dto/bootstrap.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export function bootstrapQuery() {
	return queryOptions({
		queryKey: ["bootstrap"],
		queryFn: async (): Promise<BootstrapDto> =>
			unwrap(client.api.bootstrap.$get()),
	});
}
