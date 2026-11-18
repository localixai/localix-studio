# Project overview

The **Project** button on the rail opens the open project at a glance: a year of its git activity,
read from the folder's own history, and diagrams of the project drawn by the model you choose. It is
also in the command palette as **Open Project**.

## What you can do

| Section              | Result                                                                 | Boundary                                                    |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Git activity         | See commits per day for the last year, totals and streaks.             | Reads the local history only: no account, token or network. |
| A day on the grid    | List that day's commits: short hash, subject, author and time.         | Commits reachable from the checked-out branch.              |
| Describe and diagram | Start a chat that reads the project and answers with Mermaid diagrams. | Runs on the project's model; the chat is an ordinary chat.  |

## How it works

### Git activity

Localix runs `git log` in the project's folder and counts the commits of the last year by their
author date, in local time. Each square is a day; its shade is that day's share of the busiest day,
in quarters. **Refresh** reads the history again. A folder that is not a git repository says so, and
a repository with no commit yet shows an empty year. At most 20,000 commits are read; a history with
more says that only the most recent are shown.

### Describe and diagram

Describe the project in your own words, or leave the box empty and the agent reads the folder's
README, manifests and main source directories. Choose the diagrams to draw — architecture, data
flow, request sequence, data model, user journey — and press **Generate overview**. A new chat in
the project receives the request and opens; its answer's `mermaid` fences are drawn as diagrams (see
[answer formatting](answer-formatting.md)).

The chat uses the project's model like any other chat. To keep everything on this computer, pick a
model in Settings → Models ([local models](local-models.md)), or connect a local server as a
[provider](providers.md). **Connect a local model…** opens Settings → Models.

## Plan your project

An empty chat shows **Plan your project** under the Localix bird. It plans with a model on this
computer:

1. Press it. With no local model, a popup asks you to connect one: **Download a model** opens
   Settings → Models, **Connect a model server** opens the model picker for a server you already run
   (Ollama, LM Studio). With one connected, nothing asks.
2. With a downloaded model, the chat switches to it and the planning starts at once. Behind a model
   server, the planning request waits in the message box while you pick the server's model; send it.
3. The agent asks about the project; write freely — details, goals, deadlines, asks. It restructures
   them into goals, scope, milestones and tasks, and gives an overview summary to align on.
4. When you confirm, it puts the plan on the chat's
   [task board](https://github.com/localixai/localix-marketplace/tree/main/mini-apps/kanban): each
   milestone an epic, each task under it with a checklist. It draws the milestones as a Mermaid
   flowchart.

A coding agent you start in the chat (Claude Code) reaches the same board: Localix starts it
connected to the board's MCP endpoint, told to keep the board current as it works (see
[external agents](external-agents.md)).

## Related guides

- [Answer formatting](answer-formatting.md)
- [Local models](local-models.md)
- [Providers](providers.md)

## Source of truth

- [Git activity reader](https://github.com/localixai/localix-studio/blob/main/apps/api/src/features/projects/git-activity.ts)
- [Activity grid](https://github.com/localixai/localix-studio/blob/main/apps/ui/src/features/project-overview/model/activityYear.ts)
- [Overview prompt](https://github.com/localixai/localix-studio/blob/main/apps/ui/src/features/project-overview/model/overviewPrompt.ts)
