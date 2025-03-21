import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSection, updateStatus } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import TOML from "@iarna/toml";
import { processArgument } from "helpers/args";
import { C3_DEFAULTS, openInBrowser } from "helpers/cli";
import { quoteShellArgs, runCommand } from "helpers/command";
import { readFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { poll } from "helpers/poll";
import { parse as jsoncParse } from "jsonc-parser";
import { isInsideGitRepo } from "./git";
import { chooseAccount, wranglerLogin } from "./wrangler/accounts";
import {
	readWranglerJson,
	readWranglerToml,
	wranglerJsonExists,
} from "./wrangler/config";
import type { C3Context } from "types";

export const offerToDeploy = async (ctx: C3Context) => {
	const { npm } = detectPackageManager();

	startSection(`Deploy with Cloudflare`, `Step 3 of 3`);

	// Coerce no-deploy if it isn't possible (i.e. if its a worker with any bindings)
	if (!(await isDeployable(ctx))) {
		ctx.args.deploy = false;
		updateStatus(
			`Bindings must be configured in ${blue(
				"`wrangler.toml`",
			)} before your application can be deployed`,
		);
	}

	const label = `deploy via \`${quoteShellArgs([
		npm,
		"run",
		ctx.template.deployScript ?? "deploy",
	])}\``;

	const shouldDeploy = await processArgument(ctx.args, "deploy", {
		type: "confirm",
		question: "Do you want to deploy your application?",
		label,
		defaultValue: C3_DEFAULTS.deploy,
	});

	if (!shouldDeploy) {
		return false;
	}

	// initialize a deployment object in context
	ctx.deployment = {};

	const loginSuccess = await wranglerLogin(ctx);

	if (!loginSuccess) {
		return false;
	}

	await chooseAccount(ctx);

	return true;
};

/**
 * Determines if the current project is deployable.
 *
 * Since C3 doesn't currently support a way to automatically provision the resources needed
 * by bindings, templates that have placeholder bindings will need some adjustment by the project author
 * before they can be deployed.
 */
const isDeployable = async (ctx: C3Context) => {
	if (ctx.template.platform === "pages") {
		return true;
	}
	const wranglerConfig = readWranglerConfig(ctx);
	return !hasBinding(wranglerConfig);
};

const readWranglerConfig = (ctx: C3Context) => {
	if (wranglerJsonExists(ctx)) {
		const wranglerJsonStr = readWranglerJson(ctx);
		return jsoncParse(wranglerJsonStr, undefined, { allowTrailingComma: true });
	}
	const wranglerTomlStr = readWranglerToml(ctx);
	return TOML.parse(wranglerTomlStr.replace(/\r\n/g, "\n"));
};

export const runDeploy = async (ctx: C3Context) => {
	const { npm, name: pm } = detectPackageManager();

	if (!ctx.account?.id) {
		throw new Error("Failed to read Cloudflare account.");
	}

	const baseDeployCmd = [npm, "run", ctx.template.deployScript ?? "deploy"];

	const insideGitRepo = await isInsideGitRepo(ctx.project.path);

	const deployCmd = [
		...baseDeployCmd,
		// Important: the following assumes that all framework deploy commands terminate with `wrangler pages deploy`
		...(ctx.template.platform === "pages" && ctx.commitMessage && !insideGitRepo
			? [
					...(pm === "npm" ? ["--"] : []),
					"--commit-message",
					JSON.stringify(ctx.commitMessage),
				]
			: []),
	];

	const outputFile = join(
		await mkdtemp(join(tmpdir(), "c3-wrangler-deploy-")),
		"output.json",
	);

	await runCommand(deployCmd, {
		cwd: ctx.project.path,
		env: {
			CLOUDFLARE_ACCOUNT_ID: ctx.account.id,
			NODE_ENV: "production",
			WRANGLER_OUTPUT_FILE_PATH: outputFile,
		},
		startText: "Deploying your application",
		doneText: `${brandColor("deployed")} ${dim(
			`via \`${quoteShellArgs(baseDeployCmd)}\``,
		)}`,
	});

	try {
		const contents = readFile(outputFile);

		const entries = contents
			.split("\n")
			.filter(Boolean)
			.map((entry) => JSON.parse(entry));
		const url: string | undefined =
			entries.find((entry) => entry.type === "deploy")?.targets?.[0] ??
			entries.find((entry) => entry.type === "pages-deploy")?.url;
		const deployedUrlRegex = /https:\/\/.+\.(pages|workers)\.dev/;
		const deployedUrlMatch = url?.match(deployedUrlRegex);
		if (deployedUrlMatch) {
			ctx.deployment.url = deployedUrlMatch[0];
		} else {
			throw new Error("Failed to find deployment url.");
		}
	} catch {
		throw new Error("Failed to find deployment url.");
	}

	// if a pages url (<sha1>.<project>.pages.dev), remove the sha1
	if (ctx.deployment.url?.endsWith(".pages.dev")) {
		const [proto, hostname] = ctx.deployment.url.split("://");
		const hostnameWithoutSHA1 = hostname.split(".").slice(-3).join("."); // only keep the last 3 parts (discard the 4th, i.e. the SHA1)

		ctx.deployment.url = `${proto}://${hostnameWithoutSHA1}`;
	}
};

export const maybeOpenBrowser = async (ctx: C3Context) => {
	if (ctx.deployment.url) {
		const success = await poll(ctx.deployment.url);
		if (success) {
			if (ctx.args.open) {
				await openInBrowser(ctx.deployment.url);
			}
		}
	}
};

/**
 * Recursively search the properties of node for a binding.
 */
export const hasBinding = (node: unknown): boolean => {
	if (typeof node !== "object" || node === null) {
		return false;
	}
	for (const key of Object.keys(node)) {
		if (key === "assets") {
			// Properties called "binding" within "assets" do not count as bindings.
			continue;
		}
		if (key === "binding" || key === "bindings") {
			return true;
		}
		return hasBinding(node[key as keyof typeof node]);
	}
	return false;
};
