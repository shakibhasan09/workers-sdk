import { writeFileSync } from "fs";
import { http, HttpResponse } from "msw";
import {
	deleteMTlsCertificate,
	getMTlsCertificate,
	getMTlsCertificateByName,
	listMTlsCertificates,
	uploadCaCertificateFromFs,
	uploadMTlsCertificate,
	uploadMTlsCertificateFromFs,
} from "../api";
import { type MTlsCertificateResponse } from "../api/mtls-certificate";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	function mockPostMTlsCertificate(
		resp: Partial<MTlsCertificateResponse> = {}
	) {
		const config = { calls: 0 };
		msw.use(
			http.post(
				"*/accounts/:accountId/mtls_certificates",
				async ({ request }) => {
					config.calls++;

					const body = (await request.json()) as Record<string, unknown>;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "1234",
							name: body.name,
							certificates: body.certificates,
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
							...resp,
						},
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockPostCaChainCertificate(
		resp: Partial<MTlsCertificateResponse> = {}
	) {
		const config = { calls: 0 };

		msw.use(
			http.post(
				"*/accounts/:accountId/mtls_certificates",
				async ({ request }) => {
					config.calls++;

					const body = (await request.json()) as Record<string, unknown>;
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "1234",
							name: body.name,
							certificates: body.certificates,
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
							ca: true,
							...resp,
						},
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockGetMTlsCertificates(
		certs: Partial<MTlsCertificateResponse>[] | undefined = undefined
	) {
		const config = { calls: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/mtls_certificates",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result:
							typeof certs === "undefined"
								? [
										{
											id: "1234",
											name: "cert one",
											certificates: "BEGIN CERTIFICATE...",
											issuer: "example.com...",
											uploaded_on: now.toISOString(),
											expires_on: oneYearLater.toISOString(),
										},
										{
											id: "5678",
											name: "cert two",
											certificates: "BEGIN CERTIFICATE...",
											issuer: "example.com...",
											uploaded_on: now.toISOString(),
											expires_on: oneYearLater.toISOString(),
										},
									]
								: certs,
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockGetMTlsCertificate(resp: Partial<MTlsCertificateResponse> = {}) {
		const config = { calls: 0 };
		msw.use(
			http.get(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: {
							id: "1234",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
							...resp,
						},
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	function mockDeleteMTlsCertificate() {
		const config = { calls: 0 };
		msw.use(
			http.delete(
				"*/accounts/:accountId/mtls_certificates/:certId",
				async () => {
					config.calls++;

					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: null,
					});
				},
				{ once: true }
			)
		);
		return config;
	}

	const now = new Date();
	const oneYearLater = new Date(now);
	oneYearLater.setFullYear(now.getFullYear() + 1);

	describe("cert", () => {
		describe("api", () => {
			describe("uploadMTlsCertificate", () => {
				it("should call mtls_certificates upload endpoint", async () => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await uploadMTlsCertificate("some-account-id", {
						certificateChain: "BEGIN CERTIFICATE...",
						privateKey: "BEGIN PRIVATE KEY...",
						name: "my_cert",
					});

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("uploadMTlsCertificateFromFs", () => {
				it("should fail to read cert and key files when missing", async () => {
					await expect(
						uploadMTlsCertificateFromFs("some-account-id", {
							certificateChainFilename: "cert.pem",
							privateKeyFilename: "key.pem",
							name: "my_cert",
						})
					).rejects.toMatchInlineSnapshot(
						`[ParseError: Could not read file: cert.pem]`
					);
				});

				it("should read cert and key from disk and call mtls_certificates upload endpoint", async () => {
					const mock = mockPostMTlsCertificate({
						id: "1234",
						issuer: "example.com...",
					});

					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					const cert = await uploadMTlsCertificateFromFs("some-account-id", {
						certificateChainFilename: "cert.pem",
						privateKeyFilename: "key.pem",
						name: "my_cert",
					});

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("uploadCaCertificateFromFs", () => {
				it("should fail to read ca cert when file is missing", async () => {
					await expect(
						uploadCaCertificateFromFs("some-account-id", {
							certificates: "caCert.pem",
							ca: true,
							name: "my_cert",
						})
					).rejects.toMatchInlineSnapshot(
						`[ParseError: Could not read file: caCert.pem]`
					);
				});

				it("should read ca cert from disk and call mtls_certificates upload endpoint", async () => {
					const mock = mockPostCaChainCertificate({
						id: "1234",
						issuer: "example.com...",
					});

					writeFileSync("caCert.pem", "BEGIN CERTIFICATE...");

					const cert = await uploadCaCertificateFromFs("some-account-id", {
						certificates: "caCert.pem",
						ca: true,
						name: "my_cert",
					});

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());
					expect(cert.ca).toEqual(true);

					expect(mock.calls).toEqual(1);
				});
			});

			describe("listMTlsCertificates", () => {
				it("should call mtls_certificates list endpoint", async () => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert two",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					const certs = await listMTlsCertificates("some-account-id", {}, true);

					expect(certs).toHaveLength(2);

					expect(certs[0].id).toEqual("1234");
					expect(certs[0].name).toEqual("cert one");

					expect(certs[1].id).toEqual("5678");
					expect(certs[1].name).toEqual("cert two");

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificate", () => {
				it("calls get mtls_certificates endpoint", async () => {
					const mock = mockGetMTlsCertificate({
						id: "1234",
						name: "cert one",
						certificates: "BEGIN CERTIFICATE...",
						issuer: "example.com...",
						uploaded_on: now.toISOString(),
						expires_on: oneYearLater.toISOString(),
					});

					const cert = await getMTlsCertificate("some-account-id", "1234");

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});
			});

			describe("getMTlsCertificateByName", () => {
				it("calls list mtls_certificates endpoint with name", async () => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					const cert = await getMTlsCertificateByName(
						"some-account-id",
						"cert one",
						true
					);

					expect(cert.id).toEqual("1234");
					expect(cert.issuer).toEqual("example.com...");
					expect(cert.expires_on).toEqual(oneYearLater.toISOString());

					expect(mock.calls).toEqual(1);
				});

				it("errors when a certificate cannot be found", async () => {
					const mock = mockGetMTlsCertificates([]);

					await expect(
						getMTlsCertificateByName("some-account-id", "cert one", true)
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});

				it("errors when multiple certificates are found", async () => {
					const mock = mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					await expect(
						getMTlsCertificateByName("some-account-id", "cert one", true)
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "cert one"]`
					);

					expect(mock.calls).toEqual(1);
				});
			});

			describe("deleteMTlsCertificate", () => {
				test("calls delete mts_certificates endpoint", async () => {
					const mock = mockDeleteMTlsCertificate();

					await deleteMTlsCertificate("some-account-id", "1234");

					expect(mock.calls).toEqual(1);
				});
			});
		});

		describe("commands", () => {
			describe("help", () => {
				it("should show the correct help text", async () => {
					await runWrangler("cert --help");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
						"wrangler cert

						🪪 Manage client mTLS certificates and CA certificate chains used for secured connections [open-beta]

						COMMANDS
						  wrangler cert upload  Upload a new cert [open-beta]
						  wrangler cert list    List uploaded mTLS certificates
						  wrangler cert delete  Delete an mTLS certificate

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]"
					`);
				});
			});

			describe("upload", () => {
				test("uploads certificate and key from file", async () => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runWrangler(
						"cert upload mtls-certificate --cert cert.pem --key key.pem"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading mTLS Certificate...
Success! Uploaded mTLS Certificate
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});

				test("uploads certificate and key from file with name", async () => {
					writeFileSync("cert.pem", "BEGIN CERTIFICATE...");
					writeFileSync("key.pem", "BEGIN PRIVATE KEY...");

					mockPostMTlsCertificate();

					await runWrangler(
						"cert upload mtls-certificate --cert cert.pem --key key.pem --name my-cert"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading mTLS Certificate my-cert...
Success! Uploaded mTLS Certificate my-cert
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});

				test("uploads ca certificate chain from file", async () => {
					writeFileSync("caCert.pem", "BEGIN CERTIFICATE...");

					mockPostCaChainCertificate();

					await runWrangler(
						"cert upload certificate-authority --ca-cert caCert.pem"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading CA Certificate...
Success! Uploaded CA Certificate
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});

				test("uploads ca certificate chain from file with name", async () => {
					writeFileSync("caCert.pem", "BEGIN CERTIFICATE...");

					mockPostCaChainCertificate();

					await runWrangler(
						"cert upload certificate-authority --ca-cert caCert.pem --name my-caCert"
					);

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`Uploading CA Certificate my-caCert...
Success! Uploaded CA Certificate my-caCert
ID: 1234
Issuer: example.com...
Expires on ${oneYearLater.toLocaleDateString()}`
					);
				});
			});

			describe("list", () => {
				it("should list certificates", async () => {
					mockGetMTlsCertificates();

					await runWrangler("cert list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toEqual(
						`ID: 1234
Name: cert one
Issuer: example.com...
Created on: ${now.toLocaleDateString()}
Expires on: ${oneYearLater.toLocaleDateString()}


ID: 5678
Name: cert two
Issuer: example.com...
Created on: ${now.toLocaleDateString()}
Expires on: ${oneYearLater.toLocaleDateString()}

`
					);
				});
			});

			describe("delete", () => {
				it("should require --id or --name", async () => {
					await runWrangler("cert delete");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMust provide --id or --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should require not providing --id and --name", async () => {
					await runWrangler("cert delete --id 1234 --name mycert");

					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mCan't provide both --id and --name.[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should delete certificate by id", async () => {
					mockGetMTlsCertificate({ name: "my-cert" });
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runWrangler("cert delete --id 1234");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"Deleted certificate 1234 (my-cert) successfully"`
					);
				});

				it("should delete certificate by name", async () => {
					mockGetMTlsCertificates([{ id: "1234", name: "my-cert" }]);
					mockDeleteMTlsCertificate();

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234 (my-cert)?`,
						result: true,
					});

					await runWrangler("cert delete --name my-cert");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(
						`"Deleted certificate 1234 (my-cert) successfully"`
					);
				});

				it("should not delete when certificate cannot be found by name", async () => {
					mockGetMTlsCertificates([]);

					await expect(
						runWrangler("cert delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: certificate not found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should not delete when many certificates are found by name", async () => {
					mockGetMTlsCertificates([
						{
							id: "1234",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
						{
							id: "5678",
							name: "cert one",
							certificates: "BEGIN CERTIFICATE...",
							issuer: "example.com...",
							uploaded_on: now.toISOString(),
							expires_on: oneYearLater.toISOString(),
						},
					]);

					await expect(
						runWrangler("cert delete --name my-cert")
					).rejects.toMatchInlineSnapshot(
						`[Error: multiple certificates found with name "my-cert"]`
					);
					expect(std.out).toMatchInlineSnapshot(`""`);
				});

				it("should not delete when confirmation fails", async () => {
					mockGetMTlsCertificate({ id: "1234" });

					mockConfirm({
						text: `Are you sure you want to delete certificate 1234?`,
						result: false,
					});

					await runWrangler("cert delete --id 1234");
					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`"Not deleting"`);
				});
			});
		});
	});
});
