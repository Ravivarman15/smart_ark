import React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { BY_SLUG } from "./content";

/**
 * A contextual link from an ERP screen into the guide for that screen.
 *
 * Renders NOTHING when the slug has no article. That is the point: a help link
 * pointing at a page that does not exist is worse than no help link, and this
 * makes the failure impossible rather than merely unlikely. The documentation
 * gate separately fails the build on a bad slug, so a typo is caught at build
 * time and degrades safely at runtime.
 */
export const DocsLink: React.FC<{
  slug: string;
  label?: string;
  className?: string;
}> = ({ slug, label, className }) => {
  const article = BY_SLUG.get(slug);
  if (!article) return null;
  return (
    <Link
      to={`/docs/${slug}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
        className,
      )}
    >
      <BookOpen className="h-3.5 w-3.5" aria-hidden />
      {label ?? `${article.title} guide`}
    </Link>
  );
};
