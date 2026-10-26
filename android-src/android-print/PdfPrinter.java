package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Печать содержимого WebView в файл PDF.
 * Лежит в пакете android.print, потому что обратные вызовы печати доступны только внутри него.
 */
public class PdfPrinter {
    public interface Done {
        void ok(int pages);

        void fail(String message);
    }

    public static void print(final PrintDocumentAdapter adapter, final File out, final Done done) {
        PrintAttributes attrs = new PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
            .setMinMargins(new PrintAttributes.Margins(590, 590, 590, 590)) // 15 мм в тысячных долях дюйма
            .build();
        try {
            adapter.onStart();
            adapter.onLayout(null, attrs, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
                @Override
                public void onLayoutFinished(final PrintDocumentInfo info, boolean changed) {
                    try {
                        final ParcelFileDescriptor fd = ParcelFileDescriptor.open(
                            out,
                            ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE
                        );
                        adapter.onWrite(new PageRange[] { PageRange.ALL_PAGES }, fd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                            @Override
                            public void onWriteFinished(PageRange[] pages) {
                                try {
                                    fd.close();
                                } catch (Exception ignored) {
                                }
                                adapter.onFinish();
                                done.ok(info != null ? info.getPageCount() : -1);
                            }

                            @Override
                            public void onWriteFailed(CharSequence error) {
                                try {
                                    fd.close();
                                } catch (Exception ignored) {
                                }
                                done.fail(String.valueOf(error));
                            }
                        });
                    } catch (Exception e) {
                        done.fail(String.valueOf(e.getMessage()));
                    }
                }

                @Override
                public void onLayoutFailed(CharSequence error) {
                    done.fail(String.valueOf(error));
                }
            }, null);
        } catch (Exception e) {
            done.fail(String.valueOf(e.getMessage()));
        }
    }
}
