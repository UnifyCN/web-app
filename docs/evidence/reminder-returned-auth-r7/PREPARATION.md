# Returned Auth error correction preparation

HANDOFF: COMPANION_368_RETURNED_AUTH_R7_PREPARED_NOT_APPLIED

The canonical web candidate remains aeb1ba96df61d36fe2c15eb3f75ed09d34276adb. Its R7 Standards review is still running. This directory is root-owned preparation in an exact Git archive runtime. It is not an applied or accepted candidate. No canonical product source changed.

R368-SPEC-7: getSessionUser ignored the SDK error in a resolved getSession response. The null session became confirmed sign-out. Both editors lost pending text, input identity and focus. This path differs from a rejected promise. The installed SDK contract permits a returned Auth error.

The production correction adds the error binding and throws that error before returning the session user. A successful null session still confirms sign-out. Public return type and other Auth operations stay unchanged. The Auth hook and moderation helper are the direct consumers. The client acceptance tests cover the Auth hook through the actual editors. They do not directly exercise the moderation failure path.

The exact reviewer reproduction was copied. Only its observer directory changed. It failed both text assertions on the unchanged base and passes after the correction. Four permanent rendered cases were added before the production edit: both editors with a returned retryable error and recovery, and both editors with a successful sign-out response. Before the correction, fourteen cases passed and two failed. After it, all sixteen pass. Existing twelve case bodies are byte-identical. Fixture reply types were expanded to represent the SDK result.

The full selected run passes seventy-five cases in eight files, including both retained reviewer copies. An earlier selected run passed forty-four cases in four files because three filter paths did not match the actual file names. Its output is retained. The replacement uses exact paths. Do not treat the first run as coverage of the omitted files.

The first root RED observer files were overwritten by the first GREEN run. The RED log and result JSON remain. The original reviewer's evidence is unchanged. Repeated RED and GREEN runs now use separate observer directories and preserve both complete states. The copied defect assertions remain unchanged.

The browser driver retains the earlier controls and adds returned-error preservation and recovery. It uses actual pages, hooks and CSS with a scripted SDK, data services, action endpoint and route replacement. It passes twenty-eight checks. On unchanged Auth source, twenty-one checks pass and the text/owner assertion fails. It records no page or setup error in either final run. The first passing driver waited for the expected error status. The final driver waits for request settlement, so the old success state can reach a behavior assertion. Both driver versions remain.

The full web suite passes 776 cases with thirteen skips in seventy-two files. Normal types, translation parity and changed-file lint pass. Full lint has the same twelve errors in three unchanged files, with distribution seven, one and four. The build result is recorded separately. No service, Cron, SQL, hosted, native or delivery proof is added. No model was called. UI services and SDK are scripted. These results do not establish the SDK's real event order or internal token identity.

Prepared source snapshots and the archive audit permit exact-byte application after the existing review finishes. The archive contains 1387 unchanged tracked inputs and two changed tracked files: services/auth.ts and the existing rendered caller test. Executable reviewer copies were saved as text and removed before normal gates. No process needs to remain running. Native criterion 8 and ticket/release acceptance remain open.
