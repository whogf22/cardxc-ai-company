// Developer Agent — writes code, fixes bugs, commits, deploys
import { BaseAgent } from './base-agent.js';
import simpleGit from 'simple-git';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';

export class DeveloperAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'Developer', role: 'dev' });
    this.repoPath = process.env.SITE_LOCAL_PATH;
  }

  systemPrompt() {
    return `You are the Senior Full-Stack Developer at CardXC.
Stack: Node.js, React/Next.js, PostgreSQL, deployed on Hostinger VPS with pm2.
You write production-ready code. You prefer small, surgical changes.
When asked to fix something, return a JSON edit plan:
{
  "summary": "one-line description",
  "files_to_read": ["path1", "path2"],
  "edits": [
    {"file": "src/foo.js", "action": "replace|create|delete", "search": "...", "replace": "..."}
  ],
  "verify": "npm run build",
  "risky": false
}`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Working on: ${task}`);

    // If this is a code-fix task and we have a repo
    if (this.repoPath && existsSync(this.repoPath)) {
      return await this.fixCode(task, ctx);
    }
    // Otherwise it's a planning/writing task — just think
    const response = await this.think({ task, taskType: 'coder' });
    await this.report(`Analysis:\n\`\`\`\n${response.slice(0, 1000)}\n\`\`\``);
    return response;
  }

  async fixCode(task, ctx) {
    // Step 1: gather repo context
    const tree = this.getTree();
    const context = `REPO TREE (first 80 files):\n${tree}\n\nSITE: cardxc.online (fintech)\nSTACK: Node/React`;

    // Step 2: ask for edit plan
    const plan = await this.thinkJSON({
      task: `Fix/implement: ${task}`,
      context,
      taskType: 'coder'
    });

    if (plan.risky) {
      await this.report(`⚠️ Risky change — needs review.\nReason: ${plan.reason || 'flagged'}`);
      return { status: 'needs_review', plan };
    }

    // Step 3: if it wants to see specific files, include them and re-ask for final edits
    let finalPlan = plan;
    if (plan.files_to_read?.length && !plan.edits?.length) {
      const fileContent = this.readFiles(plan.files_to_read);
      finalPlan = await this.thinkJSON({
        task: `Now produce actual edits for: ${task}`,
        context: context + '\n\nFILES:\n' + fileContent,
        taskType: 'coder'
      });
    }

    // Step 4: apply edits
    for (const edit of finalPlan.edits || []) {
      const p = resolve(this.repoPath, edit.file);
      if (edit.action === 'create') {
        writeFileSync(p, edit.content || '');
      } else if (edit.action === 'replace') {
        const current = readFileSync(p, 'utf8');
        if (!current.includes(edit.search)) {
          logger.warn(`Search not found in ${edit.file}`);
          continue;
        }
        writeFileSync(p, current.replace(edit.search, edit.replace));
      }
    }

    // Step 5: verify
    if (finalPlan.verify) {
      try {
        execSync(finalPlan.verify, { cwd: this.repoPath, timeout: 120000, stdio: 'pipe' });
      } catch (e) {
        await simpleGit(this.repoPath).checkout('.');
        await this.report(`❌ Verify failed, reverted: ${e.message.slice(0, 200)}`);
        return { status: 'verify_failed' };
      }
    }

    // Step 6: commit & deploy
    const commitResult = await this.commitAndDeploy(finalPlan.summary);
    await this.report(
      `✅ Done: ${finalPlan.summary}` +
      (commitResult.commit ? `\nCommit: \`${commitResult.commit.slice(0, 7)}\`` : '') +
      (commitResult.deployed ? `\nDeployed: yes` : '')
    );
    return { status: 'done', ...commitResult };
  }

  getTree() {
    try {
      return execSync('git ls-files | head -80', { cwd: this.repoPath, encoding: 'utf8' });
    } catch { return '(empty)'; }
  }

  readFiles(paths) {
    return paths.slice(0, 5).map(p => {
      try {
        const content = readFileSync(resolve(this.repoPath, p), 'utf8').slice(0, 3000);
        return `### ${p}\n\`\`\`\n${content}\n\`\`\``;
      } catch { return `### ${p}\n(not found)`; }
    }).join('\n\n');
  }

  async commitAndDeploy(message) {
    const result = { commit: null, deployed: false };
    if (process.env.AUTO_COMMIT !== 'false') {
      try {
        const git = simpleGit(this.repoPath);
        await git.add('.');
        const status = await git.status();
        if (status.staged.length > 0 || status.modified.length > 0) {
          const c = await git.commit(`fix(ai): ${message}`);
          result.commit = c.commit;
          try { await git.push(); } catch (e) { logger.warn(`Push failed: ${e.message}`); }
        }
      } catch (e) { logger.warn(`Commit failed: ${e.message}`); }
    }
    if (process.env.AUTO_DEPLOY !== 'false' && process.env.SITE_DEPLOY_CMD) {
      try {
        execSync(process.env.SITE_DEPLOY_CMD, { cwd: this.repoPath, timeout: 300000, stdio: 'pipe' });
        result.deployed = true;
      } catch (e) { logger.warn(`Deploy failed: ${e.message}`); }
    }
    return result;
  }
}
