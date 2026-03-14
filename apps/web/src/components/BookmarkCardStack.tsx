import type { Bookmark } from "@bookmark/types";
import { motion } from "framer-motion";
import { useCallback } from "react";
import type { Swiper as SwiperType } from "swiper";
import { Autoplay, EffectCards, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/effect-cards";
import "swiper/css/pagination";
import "swiper/css/navigation";

import { cn } from "@bookmark/ui/lib/utils";

export type SwipeDirection = "next" | "prev";

export interface BookmarkCardStackProps {
  bookmarks: Bookmark[];
  onSwipe: (bookmark: Bookmark, direction: SwipeDirection) => void;
  className?: string;
}

const carouselCss = `
  .Carousal_002 {
    padding-bottom: 50px !important;
  }
`;

export function BookmarkCardStack({
  bookmarks,
  onSwipe,
  className,
}: BookmarkCardStackProps) {
  const handleSlideChange = useCallback(
    (swiper: SwiperType) => {
      const prevIdx = swiper.previousIndex;
      const currIdx = swiper.activeIndex;
      if (prevIdx === currIdx) return;

      const prevRealIdx = prevIdx % bookmarks.length;
      const bookmark = bookmarks[prevRealIdx];
      if (!bookmark) return;

      const wentNext =
        currIdx > prevIdx ||
        (prevIdx === bookmarks.length - 1 && currIdx === 0);
      const wentPrev =
        currIdx < prevIdx ||
        (prevIdx === 0 && currIdx === bookmarks.length - 1);

      if (wentNext) {
        onSwipe(bookmark, "next");
      } else if (wentPrev) {
        onSwipe(bookmark, "prev");
        const nextIdx = (prevRealIdx + 1) % bookmarks.length;
        swiper.slideTo(nextIdx);
      }
    },
    [bookmarks, onSwipe]
  );

  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ duration: 0.3, delay: 0.5 }}
      className={cn("relative w-full max-w-3xl", className)}
    >
      <style>{carouselCss}</style>

      <Swiper
        onSlideChange={handleSlideChange}
        spaceBetween={40}
        effect="cards"
        grabCursor
        loop={bookmarks.length > 1}
        pagination={false}
        navigation={false}
        cardsEffect={{
          perSlideOffset: 18,
          perSlideRotate: 2,
          slideShadows: true,
        }}
        className="Carousal_002 swiper-cards h-[380px] w-[260px]"
        modules={[EffectCards, Autoplay, Pagination, Navigation]}
      >
        {bookmarks.map((bookmark) => (
          <SwiperSlide key={bookmark.id} className="rounded-3xl">
            <BookmarkSlideContent bookmark={bookmark} />
          </SwiperSlide>
        ))}
      </Swiper>
    </motion.div>
  );
}

function BookmarkSlideContent({ bookmark }: { bookmark: Bookmark }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      {bookmark.image ? (
        <div className="flex-1 overflow-hidden">
          <img
            src={bookmark.image}
            alt={bookmark.title ?? bookmark.url}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-end bg-[linear-gradient(135deg,rgba(94,234,212,0.12),rgba(59,130,246,0.12),rgba(251,191,36,0.12))] p-4">
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {bookmark.domain}
          </span>
        </div>
      )}
      <div className="border-t border-border/70 bg-card/95 p-4">
        <h3 className="line-clamp-2 font-medium text-foreground">
          {bookmark.title || bookmark.url}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {bookmark.domain}
        </p>
      </div>
    </div>
  );
}
