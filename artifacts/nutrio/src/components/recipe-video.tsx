export function RecipeVideo({ videoId, name }: { videoId?: string; name: string }) {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return <section className="mt-10" aria-label="Recipe preparation video" data-testid="recipe-video">
    <div className="eyebrow">Watch the preparation</div>
    <h2 className="font-display mt-2 text-2xl font-bold tracking-[-.05em] text-[#20352c]">Cook along.</h2>
    <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-[#20372d]">
      <iframe
        className="h-full w-full border-0"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={`${name} — preparation video`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
    <p className="mt-3 text-xs leading-5 text-[#68766b]">
      Video hosted by YouTube. If playback is unavailable,{' '}
      <a className="font-semibold underline" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">watch on YouTube</a>.
    </p>
  </section>;
}
