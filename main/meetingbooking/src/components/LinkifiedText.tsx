// 把文字中的網址轉成可以點的連結（公告與更新日誌的內容）；其他文字原樣顯示
// 網址遇到空白或中文標點就結束，避免把後面的「，」「。」也算進網址
const URL_PATTERN = /(https?:\/\/[^\s，。、；：！？（）「」『』<>"]+)/;

const LinkifiedText = ({ text }: { text: string }) => (
  <>
    {text.split(URL_PATTERN).map((part, i) =>
      i % 2 === 1 ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline break-all">
          {part}
        </a>
      ) : (
        part
      )
    )}
  </>
);

export default LinkifiedText;
