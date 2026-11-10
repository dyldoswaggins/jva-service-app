import { bigPack, isCounted, minIsSet, minOf, money, num, orderClassText, reorderList, toCsv, download } from '../rules.js'

export default function ReorderView({ parts, can = {} }) {
  const showCost = !!can.costs
  const L = reorderList(parts)
  const notCounted = parts.filter(p => !isCounted(p) && minOf(p) > 0).length
  const total = L.reduce((s, x) => s + x.need * (Number(x.p.price) || 0), 0)

  const exportCsv = () =>
    download(
      `Rolex parts reorder ${new Date().toLocaleDateString('en-CA')}.csv`,
      toCsv(L.map(({ p, need, packs }) => ({
        Class: p.abc || '', 'Rolex part # (RMC)': p.rmc, Description: p.name, Category: p.cat, Subcategory: p.sub,
        Calibre: p.cal || '', 'In stock': p.qty, Min: minOf(p), 'Min is suggested': minIsSet(p) ? '' : 'Yes',
        'Order qty': need, Packs: packs || '', 'Pack size': bigPack(p) || 1,
        ...(showCost ? { 'Pack price': p.pack_price ?? '', 'Unit cost': p.price ?? '', 'Est. cost': p.price != null ? +(need * p.price).toFixed(2) : '' } : {}),
        'Used since Jan 2025': p.used || 0,
      })))
    )

  return (
    <div className="panel">
      <h2>Reorder list</h2>
      <p className="msg">
        {L.length} counted part{L.length === 1 ? ' is' : 's are'} at or below minimum{showCost ? ` · estimated ${money(total)}` : ''}.
        {notCounted ? ` ${notCounted} parts with a minimum aren't counted yet and aren't included.` : ''} * = suggested
        minimum from 2025–26 use; set your own in each part's details.
      </p>
      {L.length ? (
        <>
          <div className="imp-wrap">
            <table className="imp">
              <thead>
                <tr><th>Part #</th><th>Description</th><th>Category</th><th className="r">In stock</th><th className="r">Min</th>
                  <th className="r">Order</th>{showCost && <><th className="r">Unit cost</th><th className="r">Est.</th></>}<th className="r">Used 25–26</th></tr>
              </thead>
              <tbody>
                {['A', 'B', 'C'].flatMap(cls => {
                  const g = L.filter(x => (x.p.abc || 'B') === cls)
                  if (!g.length) return []
                  return [
                    <tr key={cls} className="grp"><td colSpan={showCost ? 9 : 7}>Class {cls} · {orderClassText(cls)} · {g.length} part{g.length === 1 ? '' : 's'}</td></tr>,
                    ...g.map(({ p, need, packs }) => (
                      <tr key={p.id}>
                        <td className="mono b">{p.rmc}</td><td className="d" title={p.name}>{p.name}</td><td>{p.cat} › {p.sub}</td>
                        <td className="r">{num(p.qty)}</td><td className="r">{num(minOf(p))}{minIsSet(p) ? '' : '*'}</td>
                        <td className="r b">{num(need)}{packs ? <div className="heard">{packs} pack{packs === 1 ? '' : 's'} of {bigPack(p)}</div> : null}</td>
                        {showCost && <td className="r">{p.price != null ? money(p.price) : '–'}</td>}
                        {showCost && <td className="r">{p.price != null ? money(need * p.price) : '–'}</td>}
                        <td className="r">{num(p.used || 0)}</td>
                      </tr>
                    )),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <div className="actions"><button type="button" className="btn solid" onClick={exportCsv}>Reorder list (Excel)</button></div>
        </>
      ) : <p className="msg">Nothing is below minimum.</p>}
    </div>
  )
}
