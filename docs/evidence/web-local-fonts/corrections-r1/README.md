# Root corrections of font review r1 S1 and S2

S1: the original CJS inspector has three no-require-imports errors. Running ESLint on that exact file reproduces all three before the edit (exit1, lint-red.log.gz). The current inspector is inspect-fonts.mjs with standard ES imports. Its focused lint exits0 with no disable or ignore rule. Its runtime output for all18trackedfonts is byte-identical to the original inspector (metadata-before.json.gz/metadata-after.json.gz). The metadata SHA-256 is e13caeac3b361b446de015ac3983b4b0c97b5e1287fc0873d41e56d582ae0efb. No product code or font input changed.

The final full command npm run lint -- --format json exits1with12errors, distributed7/1/4across companion-context-362/context_rls_test.ts,companion-actions/rollback_test.ts,companion-actions/support.ts. These three files are byte-equal to accepted02377a33. The final tree adds0lint errors. This is a scoped correction, not a claim of a passing full repository lint gate. The original evidence now identifies its narrower focused scope and the independently observed15error final1c704c1f result. Old raw logs remain unchanged.

S2: all seven Inter metadata copyright strings say2016. The pinned official OFL-Inter.txt says2020. The evidence now records this difference. All18font binaries and four official licenses are unchanged. No license or font notice was edited.

The initial unit run with missing fonts.css ran0tests during setup. The evidence now says this explicitly. It is not assertion-level red or proof of strictTDD. The original implementer's historical skill-availability claim remains a reported observation, not a verified current fact. The independent r1blocked baseline product build remains valid prior build-boundary evidence.

Final root npm test exits0:53files/635tests. Normal npm run build exits0. Active product/font/asset/license/preload/layout/config/verifier bytes equal reviewed1c704c1f. Prior r1normal/blocked build/rendering/delivery proof remains PRIOR independently produced evidence; none is claimed as newly repeated here. No new behavior test was needed for the mechanical import and record corrections. The real lint tool and byte-identical runtime output check the affected boundary.

Logs are exact gzip payloads with byte/hash manifest. checks.json.gz contains counts and metadata/license observations. No stack/server/browser/deploy, hosted/paid provider, newmobile change, package/lock/CI/instruction edit, integration or PR action occurred. Commands ended naturally. Fresh independent review is required. This is not acceptance.
