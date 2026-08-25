/**
 * Pure, immutable edit operations on ResumeData for inline editing. Each takes
 * the current resume and returns a new one; the editable ResumePaper calls these
 * and hands the result to the update mutation. Kept pure (no persistence) so they
 * stay trivially testable and reusable.
 */

import type {
  ResumeContact,
  ResumeData,
  ResumeExperience,
  ResumeProject,
} from "@/types/resume";

/** Sections that hold an array of entries. */
export type EntrySection = "education" | "experience" | "projects" | "skills";

/**
 * A functional update on the resume. Manual edits are threaded as updaters
 * (not precomputed values) so each op applies to the *freshest* resume at commit
 * time rather than a possibly-stale render closure — the key to keeping rapid
 * inline edits from clobbering one another. See `useUpdateResumeData`.
 */
export type ResumeUpdater = (prev: ResumeData) => ResumeData;

/* ----- contact + summary ------------------------------------------------- */

export function setContactField(
  data: ResumeData,
  field: keyof ResumeContact,
  value: string,
): ResumeData {
  return { ...data, contact: { ...data.contact, [field]: value } };
}

export function setSummary(data: ResumeData, value: string): ResumeData {
  return { ...data, summary: value };
}

/* ----- entry field setters (typed per section) --------------------------- */

export function setEducationField(
  data: ResumeData,
  id: string,
  field: "institution" | "location" | "degree" | "dates",
  value: string,
): ResumeData {
  return {
    ...data,
    education: data.education.map((e) =>
      e.id === id ? { ...e, [field]: value } : e,
    ),
  };
}

export function setExperienceField(
  data: ResumeData,
  id: string,
  field: "title" | "organization" | "location" | "dates",
  value: string,
): ResumeData {
  return {
    ...data,
    experience: data.experience.map((e) =>
      e.id === id ? { ...e, [field]: value } : e,
    ),
  };
}

export function setProjectField(
  data: ResumeData,
  id: string,
  field: "name" | "tech" | "dates",
  value: string,
): ResumeData {
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id === id ? { ...p, [field]: value } : p,
    ),
  };
}

/* ----- bullets (experience + projects both have {id, bullets}) ----------- */

type WithBullets = { id: string; bullets: string[] };

function mapBullets<T extends WithBullets>(
  arr: T[],
  id: string,
  fn: (bullets: string[]) => string[],
): T[] {
  return arr.map((e) => (e.id === id ? { ...e, bullets: fn(e.bullets) } : e));
}

type BulletSection = "experience" | "projects";

export function setBullet(
  data: ResumeData,
  section: BulletSection,
  id: string,
  index: number,
  value: string,
): ResumeData {
  const fn = (bs: string[]) => bs.map((b, i) => (i === index ? value : b));
  return section === "experience"
    ? { ...data, experience: mapBullets(data.experience, id, fn) }
    : { ...data, projects: mapBullets(data.projects, id, fn) };
}

export function addBullet(
  data: ResumeData,
  section: BulletSection,
  id: string,
): ResumeData {
  const fn = (bs: string[]) => [...bs, ""];
  return section === "experience"
    ? { ...data, experience: mapBullets(data.experience, id, fn) }
    : { ...data, projects: mapBullets(data.projects, id, fn) };
}

export function removeBullet(
  data: ResumeData,
  section: BulletSection,
  id: string,
  index: number,
): ResumeData {
  const fn = (bs: string[]) => bs.filter((_, i) => i !== index);
  return section === "experience"
    ? { ...data, experience: mapBullets(data.experience, id, fn) }
    : { ...data, projects: mapBullets(data.projects, id, fn) };
}

/* ----- skills ------------------------------------------------------------ */

export function setSkillCategory(
  data: ResumeData,
  id: string,
  value: string,
): ResumeData {
  return {
    ...data,
    skills: data.skills.map((s) => (s.id === id ? { ...s, category: value } : s)),
  };
}

/** Edit the comma-separated skill items as one string; split + trim on commit. */
export function setSkillItems(
  data: ResumeData,
  id: string,
  csv: string,
): ResumeData {
  const items = csv
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    ...data,
    skills: data.skills.map((s) => (s.id === id ? { ...s, items } : s)),
  };
}

/* ----- add / remove entries ---------------------------------------------- */

export function addEntry(
  data: ResumeData,
  section: EntrySection,
): { data: ResumeData; id: string } {
  const id = crypto.randomUUID();
  switch (section) {
    case "education":
      return {
        data: {
          ...data,
          education: [
            ...data.education,
            { id, institution: "", location: "", degree: "", dates: "" },
          ],
        },
        id,
      };
    case "experience": {
      const entry: ResumeExperience = {
        id,
        title: "",
        organization: "",
        location: "",
        dates: "",
        bullets: [],
      };
      return { data: { ...data, experience: [...data.experience, entry] }, id };
    }
    case "projects": {
      const entry: ResumeProject = {
        id,
        name: "",
        tech: "",
        dates: "",
        bullets: [],
      };
      return { data: { ...data, projects: [...data.projects, entry] }, id };
    }
    case "skills":
      return {
        data: {
          ...data,
          skills: [...data.skills, { id, category: "", items: [] }],
        },
        id,
      };
  }
}

export function removeEntry(
  data: ResumeData,
  section: EntrySection,
  id: string,
): ResumeData {
  switch (section) {
    case "education":
      return { ...data, education: data.education.filter((e) => e.id !== id) };
    case "experience":
      return { ...data, experience: data.experience.filter((e) => e.id !== id) };
    case "projects":
      return { ...data, projects: data.projects.filter((p) => p.id !== id) };
    case "skills":
      return { ...data, skills: data.skills.filter((s) => s.id !== id) };
  }
}
