export function courseLabel(course: { code: string; section: string }): string {
  return `${course.code}-${course.section}`;
}
