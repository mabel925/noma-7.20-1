import React from "react";

interface NomaSpriteProps {
  pose?: "reading" | "chatting";
  className?: string;
}

export const NomaSprite: React.FC<NomaSpriteProps> = ({
  pose = "reading",
  className = "",
}) => {
  return (
    <div
      className={`relative select-none pointer-events-none w-full ${className}`}
      style={{
        transformOrigin: "left bottom",
      }}
    >
      <img
        src="https://pub-532cb82eb9f14c308250afaead82a168.r2.dev/noma.png"
        alt="Noma Character"
        className="w-full h-auto block"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};
