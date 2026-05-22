import { youtubeEmbedUrl } from "@/lib/video-url";

export function EngineVideoSection({ url }: { url: string }) {
  const embed = youtubeEmbedUrl(url);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">エンジン稼働動画</h2>
      <p className="mt-1 text-xs text-muted">RideWorks 登録（外部リンク）</p>

      {embed ? (
        <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-border bg-black">
          <iframe
            src={embed}
            title="エンジン稼働動画"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : null}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/20"
      >
        {embed ? "YouTubeで開く" : "動画を開く"} →
      </a>
    </div>
  );
}
