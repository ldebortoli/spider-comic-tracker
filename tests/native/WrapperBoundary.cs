using System;
using System.IO;
internal static class WrapperBoundary
{
    private static int Main(string[] args)
    {
        File.AppendAllText(Environment.GetEnvironmentVariable("SPIDER_WRAPPER_TEST_LOG"),
            Directory.GetCurrentDirectory() + "\n" + string.Join("|", args) + "\n");
        return 0;
    }
}
